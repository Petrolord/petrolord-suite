"""Deck bundle download + authoritative validation.

The enqueue RPC's checks are advisory (storage content can change between
enqueue and claim); everything here is the real gate. Validation is a
deny-list plus resource caps — anything else is flow's problem, and flow's
own error is surfaced honestly (plan risk #1)."""
import hashlib
import os
import re

from . import config, supa
from .errors import SimFailure

# PYACTION/PYINPUT embed arbitrary Python inside flow — RCE by design.
# PATHS defines path aliases we would have to resolve to confine; reject it
# outright (rare in practice, and the error says exactly what to do).
BANNED_KEYWORDS = ("PYACTION", "PYINPUT", "PATHS")

# Keywords whose data record references another file.
FILE_KEYWORDS = ("INCLUDE", "GDFILE", "IMPORT")

_TEXT_EXTS = {".data", ".inc", ".grdecl", ".txt", ".sch", ".pvo", ".vfp", ".prop"}


def _is_probably_text(name):
    ext = os.path.splitext(name)[1].lower()
    return ext in _TEXT_EXTS or ext == ""


def download_bundle(user_id, case_id, dest_dir):
    """Download every object under {user_id}/{case_id}/deck/ into dest_dir,
    preserving relative paths. Returns [(relpath, size)]."""
    prefix = f"{user_id}/{case_id}/deck"
    try:
        entries = supa.storage_list(prefix)
    except Exception as e:
        raise SimFailure("download_failed", f"Could not list the deck bundle: {e}")
    if not entries:
        raise SimFailure("validate_failed", "The case has no deck files uploaded.")
    if len(entries) > config.BUNDLE_MAX_FILES:
        raise SimFailure("validate_failed",
                         f"Deck bundle has {len(entries)} files (limit {config.BUNDLE_MAX_FILES}).")
    total = sum(size for _, size in entries)
    if total > config.BUNDLE_MAX_BYTES:
        raise SimFailure("validate_failed",
                         f"Deck bundle is {total / 1e6:.1f} MB (limit "
                         f"{config.BUNDLE_MAX_BYTES / 1e6:.0f} MB).")

    files = []
    for full, size in entries:
        rel = os.path.relpath(full, prefix)
        if rel.startswith(".."):
            raise SimFailure("validate_failed", f"Suspicious object path: {full}")
        local = os.path.join(dest_dir, rel)
        os.makedirs(os.path.dirname(local), exist_ok=True)
        try:
            data = supa.storage_download(full)
        except Exception as e:
            raise SimFailure("download_failed", f"Could not download {rel}: {e}")
        with open(local, "wb") as f:
            f.write(data)
        files.append((rel, len(data)))
    return files


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _strip_comment(line):
    idx = line.find("--")
    return line if idx < 0 else line[:idx]


def _iter_code_lines(text):
    for raw in text.splitlines():
        line = _strip_comment(raw).strip()
        if line:
            yield line


def _referenced_files(text):
    """Filenames referenced by INCLUDE/GDFILE/IMPORT data records. The record
    is the next non-comment content after the keyword, terminated by '/'."""
    refs = []
    lines = list(_iter_code_lines(text))
    i = 0
    while i < len(lines):
        word = lines[i].split()[0].upper() if lines[i].split() else ""
        if word in FILE_KEYWORDS:
            record = []
            j = i + 1
            while j < len(lines):
                record.append(lines[j])
                if "/" in lines[j]:
                    break
                j += 1
            blob = " ".join(record)
            m = re.search(r"'([^']+)'|\"([^\"]+)\"|(\S+)", blob)
            if m:
                ref = next(g for g in m.groups() if g)
                refs.append(ref.rstrip("/").strip())
            i = j + 1
        else:
            i += 1
    return refs


def validate_bundle(bundle_dir, main_deck_rel):
    """Deny-list + caps over the downloaded bundle. Raises SimFailure."""
    main_path = os.path.join(bundle_dir, main_deck_rel)
    if not os.path.isfile(main_path):
        raise SimFailure("validate_failed",
                         f"Main deck '{main_deck_rel}' is missing from the bundle.")
    if os.path.getsize(main_path) > config.DECK_MAX_BYTES:
        raise SimFailure("validate_failed",
                         f"Main deck exceeds {config.DECK_MAX_BYTES / 1e6:.0f} MB.")

    bundle_real = os.path.realpath(bundle_dir)
    banned_re = re.compile(r"^\s*(" + "|".join(BANNED_KEYWORDS) + r")\b", re.IGNORECASE)

    for root, _dirs, names in os.walk(bundle_dir):
        for name in names:
            path = os.path.join(root, name)
            if not _is_probably_text(name):
                continue
            try:
                with open(path, "r", errors="replace") as f:
                    text = f.read()
            except OSError as e:
                raise SimFailure("validate_failed", f"Unreadable file {name}: {e}")

            for line in text.splitlines():
                if banned_re.match(_strip_comment(line)):
                    kw = banned_re.match(_strip_comment(line)).group(1).upper()
                    raise SimFailure(
                        "validate_failed",
                        f"Keyword {kw} is not allowed on this platform"
                        + (" (it executes embedded Python inside the simulator)."
                           if kw != "PATHS" else
                           " (path aliases are not supported; use plain relative INCLUDE paths)."))

            for ref in _referenced_files(text):
                if os.path.isabs(ref) or ".." in ref.replace("\\", "/").split("/"):
                    raise SimFailure("validate_failed",
                                     f"Referenced file '{ref}' escapes the deck bundle "
                                     "(absolute or parent paths are not allowed).")
                target = os.path.realpath(os.path.join(os.path.dirname(path), ref))
                if not target.startswith(bundle_real + os.sep) and target != bundle_real:
                    raise SimFailure("validate_failed",
                                     f"Referenced file '{ref}' resolves outside the deck bundle.")
                if not os.path.isfile(target):
                    raise SimFailure("validate_failed",
                                     f"Referenced file '{ref}' is missing from the bundle.")

    with open(main_path, "r", errors="replace") as f:
        main_text = f.read()
    _check_dimens(main_text)
    _check_report_steps(main_text)


def _check_dimens(text):
    lines = list(_iter_code_lines(text))
    for i, line in enumerate(lines):
        if line.split() and line.split()[0].upper() == "DIMENS":
            blob = " ".join(lines[i + 1:i + 4])
            nums = re.findall(r"\d+", blob.split("/")[0])
            if len(nums) >= 3:
                nx, ny, nz = (int(n) for n in nums[:3])
                cells = nx * ny * nz
                if cells > config.MAX_TOTAL_CELLS:
                    raise SimFailure(
                        "validate_failed",
                        f"Grid is {nx}x{ny}x{nz} = {cells:,} cells "
                        f"(limit {config.MAX_TOTAL_CELLS:,} on this platform).")
            return


def _count_tstep_values(record):
    """TSTEP records use N*value repeats: '10*30.4' is 10 steps."""
    count = 0
    for tok in record.replace("/", " ").split():
        m = re.match(r"^(\d+)\*", tok)
        if m:
            count += int(m.group(1))
        elif re.match(r"^[\d.]+$", tok):
            count += 1
    return count


def _check_report_steps(text):
    lines = list(_iter_code_lines(text))
    steps = 0
    i = 0
    while i < len(lines):
        word = lines[i].split()[0].upper() if lines[i].split() else ""
        if word == "DATES":
            j = i + 1
            while j < len(lines) and lines[j].strip() != "/":
                if "/" in lines[j]:
                    steps += 1
                j += 1
            i = j + 1
        elif word == "TSTEP":
            j = i + 1
            record = []
            while j < len(lines):
                record.append(lines[j])
                if lines[j].rstrip().endswith("/"):
                    break
                j += 1
            steps += _count_tstep_values(" ".join(record))
            i = j + 1
        else:
            i += 1
    if steps > config.MAX_REPORT_STEPS:
        raise SimFailure("validate_failed",
                         f"Schedule has ~{steps:,} report steps "
                         f"(limit {config.MAX_REPORT_STEPS:,} on this platform).")
