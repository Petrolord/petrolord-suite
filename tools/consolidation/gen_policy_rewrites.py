#!/usr/bin/env python3
"""Membership-consolidation policy rewriter.

Reads catalog/legacy-policies.json (a live pg_policy dump of every policy whose
expression references the deprecated membership tables organization_users /
org_members) and emits policy_rewrites.sql: DROP + CREATE for each policy with
the legacy membership subquery replaced by the canonical SECURITY DEFINER
helpers, preserving each policy's original semantics:

  <col> IN (SELECT organization_id FROM organization_users
            WHERE user_id = auth.uid())              -> public.is_org_member(<col>)
  ... AND role/user_role = ANY(ARRAY[...])           -> public.has_org_role(<col>, ARRAY[...])
  <col> = (SELECT organization_id ... LIMIT 1)       -> <col> = public.my_org_id()
  EXISTS (... alias.organization_id = <outer> ...)   -> is_org_member/has_org_role(<outer>, ...)
  EXISTS (... no org binding ... role check)         -> public.has_any_org_role(ARRAY[...])

Role arrays are preserved verbatim with 'owner' added when missing: the legacy
tables kept admin-ness in a separate user_role column (owner rows carried
user_role='org_admin'); the canonical organization_members table has a single
role column where org creators are 'owner', so an array that gated on
user_role values must also accept 'owner' or org owners would lose access.

Out of scope (skipped, listed in the header of the output):
  - petrolord.* policies: the drilling module's own petrolord.org_members table
    is a different table that is NOT part of this consolidation.
  - policies ON public.org_members itself: dropped together with the table.
  - master_apps' purchased_modules JOIN policies: hand-written overrides below.

Regenerate with:  python3 tools/consolidation/gen_policy_rewrites.py
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CATALOG = os.path.join(HERE, "catalog", "legacy-policies.json")
OUT = os.path.join(HERE, "policy_rewrites.sql")

LEGACY_TABLES = ("organization_users", "org_members")
CMD = {"r": "select", "a": "insert", "w": "update", "d": "delete", "*": "all"}

# Hand-written overrides for shapes the mechanical rewriter must not guess at.
# Key: (schema, table, policy name, 'qual'|'withcheck') -> replacement expression.
MASTER_APPS_SUB = (
    "(EXISTS ( SELECT 1\n   FROM (purchased_modules pm\n"
    "     JOIN organization_members ou ON ((pm.organization_id = ou.organization_id)))\n"
    "  WHERE ((ou.user_id = auth.uid()) AND (ou.status = 'active'::text) AND "
    "(pm.status = 'active'::text) AND (pm.expiry_date > now()) AND "
    "((pm.app_uuid = master_apps.id) OR ((pm.app_uuid IS NULL) AND "
    "(pm.module_uuid = master_apps.module_id))))))"
)
OVERRIDES = {
    ("public", "master_apps", "Users can view apps their org has purchased", "qual"):
        "(" + MASTER_APPS_SUB + " OR (auth.role() = 'service_role'::text))",
    ("public", "master_apps", "Users can view purchased apps", "qual"):
        MASTER_APPS_SUB,
}


def find_spans(expr):
    """Yield (start, end) of every parenthesized subquery over a legacy table."""
    spans = []
    for m in re.finditer(r"\(\s*SELECT\b", expr):
        start = m.start()
        depth = 0
        for i in range(start, len(expr)):
            if expr[i] == "(":
                depth += 1
            elif expr[i] == ")":
                depth -= 1
                if depth == 0:
                    body = expr[start : i + 1]
                    if re.search(
                        r"\bFROM\s+(public\.)?(organization_users|org_members)\b", body
                    ) and "petrolord.org_members" not in body:
                        # innermost only: skip if another legacy subquery nests inside
                        inner = body[1:-1]
                        if not re.search(
                            r"\(\s*SELECT\b(?:(?!\(\s*SELECT).)*\bFROM\s+(public\.)?(organization_users|org_members)\b",
                            inner[inner.find("FROM") + 4 :],
                            re.S,
                        ):
                            spans.append((start, i + 1))
                    break
    return spans


def parse_sub(body):
    """Classify one legacy-membership subquery. Returns dict or None."""
    m = re.search(
        r"\bFROM\s+(?:public\.)?(organization_users|org_members)"
        r"(?:[ \t]+(?!WHERE\b|LIMIT\b)(\w+))?",
        body,
    )
    if not m:
        return None
    table, alias = m.group(1), m.group(2)
    ref = alias or table
    orgcol = "org_id" if table == "org_members" else "organization_id"

    if not re.search(rf"{re.escape(ref)}\.user_id\s*=\s*auth\.uid\(\)", body):
        return None

    roles = None
    rm = re.search(
        rf"{re.escape(ref)}\.(?:role|user_role)\s*=\s*ANY\s*\(\s*ARRAY\[([^\]]*)\]",
        body,
    )
    if rm:
        roles = re.findall(r"'([^']*)'", rm.group(1))
    else:
        rm = re.search(
            rf"{re.escape(ref)}\.(?:role|user_role)\s*=\s*'([^']*)'::text", body
        )
        if rm:
            roles = [rm.group(1)]

    sm = re.search(rf"{re.escape(ref)}\.status\s*=\s*'([^']*)'::text", body)

    binding = None
    bm = re.search(
        rf"{re.escape(ref)}\.{orgcol}\s*=\s*((?:\w+\.)?\w+)", body
    )
    if bm and not bm.group(1).startswith(ref + "."):
        binding = bm.group(1)
    else:
        bm = re.search(
            rf"((?:\w+\.)?\w+)\s*=\s*{re.escape(ref)}\.{orgcol}", body
        )
        if bm and not bm.group(1).startswith(ref + "."):
            binding = bm.group(1)

    # every condition in the subquery must be one we understood
    residue = body
    for pat in (
        rf"{re.escape(ref)}\.user_id\s*=\s*auth\.uid\(\)",
        rf"{re.escape(ref)}\.(?:role|user_role)\s*=\s*ANY\s*\(\s*ARRAY\[[^\]]*\]\s*\)",
        rf"{re.escape(ref)}\.(?:role|user_role)\s*=\s*'[^']*'::text",
        rf"{re.escape(ref)}\.status\s*=\s*'[^']*'::text",
        rf"{re.escape(ref)}\.{orgcol}\s*=\s*(?:\w+\.)?\w+",
        rf"(?:\w+\.)?\w+\s*=\s*{re.escape(ref)}\.{orgcol}",
        rf"SELECT\s+(?:1|{re.escape(ref)}\.{orgcol}|{re.escape(table)}\.{orgcol})",
        rf"FROM\s+(?:public\.)?{re.escape(table)}(?:\s+\w+)?",
        r"LIMIT\s+1",
        r"\bWHERE\b|\bAND\b|\bOR\b|[()\s]",
    ):
        residue = re.sub(pat, " ", residue)
    if residue.strip():
        return None

    return {
        "roles": roles,
        "binding": binding,
        "scalar": bool(re.search(r"LIMIT\s+1", body)),
        "selects_org": bool(
            re.search(rf"SELECT\s+(?:{re.escape(ref)}|{re.escape(table)})\.{orgcol}", body)
        ),
    }


def role_array_sql(roles):
    vals = sorted(set(roles) | {"owner"})
    return "ARRAY[" + ", ".join(f"'{v}'::text" for v in vals) + "]"


def rewrite(expr, ctx, problems):
    if not expr:
        return expr
    while True:
        spans = find_spans(expr)
        if not spans:
            break
        start, end = spans[0]
        body = expr[start:end]
        sub = parse_sub(body)
        if sub is None:
            problems.append(f"{ctx}: unparsable subquery: {body[:200]}")
            return None

        before = expr[:start]
        m_in = re.search(r'((?:"?\w+"?\.)?"?\w+"?)\s+IN\s+\($', before + "(")
        m_eq = re.search(r'((?:"?\w+"?\.)?"?\w+"?)\s+=\s+\($', before + "(")
        m_ex = re.search(r"EXISTS\s+\($", before + "(")

        if m_ex:
            if sub["binding"] and sub["roles"]:
                call = f"public.has_org_role({sub['binding']}, {role_array_sql(sub['roles'])})"
            elif sub["binding"]:
                call = f"public.is_org_member({sub['binding']})"
            elif sub["roles"]:
                call = f"public.has_any_org_role({role_array_sql(sub['roles'])})"
            else:
                problems.append(f"{ctx}: unbound EXISTS without role gate")
                return None
            expr = before[: m_ex.start()] + call + expr[end:]
        elif m_in and sub["selects_org"]:
            col = m_in.group(1)
            if sub["roles"]:
                call = f"public.has_org_role({col}, {role_array_sql(sub['roles'])})"
            else:
                call = f"public.is_org_member({col})"
            expr = before[: m_in.start()] + call + expr[end:]
        elif m_eq and sub["scalar"] and sub["selects_org"]:
            col = m_eq.group(1)
            if sub["roles"]:
                problems.append(f"{ctx}: scalar my-org subquery with role gate")
                return None
            expr = before[: m_eq.start()] + f"{col} = public.my_org_id()" + expr[end:]
        else:
            problems.append(f"{ctx}: unrecognized context before subquery: ...{before[-60:]}")
            return None
    return expr


def main():
    with open(CATALOG) as f:
        policies = json.load(f)

    out, skipped, problems = [], [], []
    for p in policies:
        key = (p["schema"], p["tbl"], p["name"])
        ctx = f'{p["schema"]}.{p["tbl"]}."{p["name"]}"'
        if p["schema"] == "petrolord":
            skipped.append(f"{ctx} (drilling-module namespace, out of scope)")
            continue
        if p["schema"] == "public" and p["tbl"] == "org_members":
            skipped.append(f"{ctx} (dropped together with public.org_members)")
            continue

        new = {}
        bad = False
        for part in ("qual", "withcheck"):
            src = p[part]
            if key + (part,) in OVERRIDES:
                new[part] = OVERRIDES[key + (part,)]
            elif src and re.search(r"\b(organization_users|org_members)\b", src):
                r = rewrite(src, f"{ctx}[{part}]", problems)
                if r is None:
                    bad = True
                    break
                new[part] = r
            else:
                new[part] = src
        if bad:
            continue
        for part in ("qual", "withcheck"):
            if new[part] and re.search(r"\b(organization_users)\b|(?<!petrolord\.)\borg_members\b", new[part]):
                problems.append(f"{ctx}[{part}]: legacy reference survived rewrite")
                bad = True
        if bad:
            continue

        tbl = f'{p["schema"]}."{p["tbl"]}"' if p["schema"] != "public" else f'public."{p["tbl"]}"'
        cmd = CMD[p["cmd"]]
        stmt = [f'drop policy if exists "{p["name"]}" on {tbl};']
        create = f'create policy "{p["name"]}" on {tbl}\n  as permissive for {cmd}\n  to {p["roles"]}'
        if new["qual"] and cmd != "insert":
            create += f'\n  using ({new["qual"]})'
        if new["withcheck"]:
            create += f'\n  with check ({new["withcheck"]})'
        elif cmd == "insert" and new["qual"]:
            # INSERT policies only take WITH CHECK; a dump would not put it in qual,
            # but guard anyway.
            create += f'\n  with check ({new["qual"]})'
        stmt.append(create + ";")
        out.append((ctx, "\n".join(stmt)))

    if problems:
        sys.stderr.write("UNHANDLED (fix or add OVERRIDES):\n" + "\n".join(problems) + "\n")
        sys.exit(1)

    with open(OUT, "w") as f:
        f.write("-- GENERATED by tools/consolidation/gen_policy_rewrites.py — do not hand-edit.\n")
        f.write(f"-- {len(out)} policies rewritten onto canonical membership helpers.\n")
        f.write("-- Skipped (out of scope):\n")
        for s in skipped:
            f.write(f"--   {s}\n")
        f.write("\n")
        for ctx, stmt in out:
            f.write(f"-- {ctx}\n{stmt}\n\n")
    print(f"wrote {OUT}: {len(out)} policies rewritten, {len(skipped)} skipped")


if __name__ == "__main__":
    main()
