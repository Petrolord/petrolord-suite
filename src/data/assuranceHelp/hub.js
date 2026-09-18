export default {
  appKey: 'hub',
  title: 'Assurance & Compliance hub',
  summary: 'What needs someone across the nine Assurance apps, counted from your organization\'s own records, worst first.',
  sections: [
    {
      id: 'purpose',
      title: 'What the hub is for',
      paragraphs: [
        'The hub is the one page that looks across all nine Assurance apps at once: Risk Register, Regulatory Compliance, Document Control, Peer Review Manager, Management of Change, Quality Assurance Plan & NCR, ISO Compliance, Lessons Learned and the Audit & Findings Manager.',
        'It does not keep records of its own and it never writes anything. Every number on it is the owning app\'s own count, taken through the same rules that app uses, so the hub and the app always agree. When they seem not to, refresh the hub: it reads when you open it and when you press Refresh, and does not update itself in the background.',
        'Below the analytics is the catalogue of Assurance apps, the same tiles every module hub shows. A tile opens its app if your organization has it.',
      ],
    },
    {
      id: 'getting-started',
      title: 'Getting started',
      steps: [
        'Read the four tiles at the top: Exposed now, Overdue, Due soon and Apps reporting.',
        'Click a tier tile to filter the Needs attention list to that tier. Click it again to clear the filter.',
        'Open an item in Needs attention to go straight to that record in its own app.',
        'Use the app and tier selectors above the list to narrow it, and CSV to download exactly the rows the list is showing.',
        'Scroll to the nine app panels for each app\'s own headline counts, and use Open on a panel to go to that app.',
      ],
    },
    {
      id: 'rules',
      title: 'How an item is placed in a tier',
      paragraphs: [
        'Each app decides whether its own record is overdue, expired or due soon, using its own dates and lead windows. The hub only sorts those answers into three tiers.',
      ],
      bullets: [
        'Exposed now: the exposure exists today, beyond lateness. A temporary or emergency change still in effect past its expiry date. A permit or licence that has expired, or a regulatory obligation past its due date. A stop-work audit finding that is still open. A Critical non-conformance that is still open. A live risk whose residual score is in the Critical band.',
        'Overdue: a control has missed its own date. A live risk, document or lesson review past due. A peer review past its due date, or a live review with unresolved Critical or Major comments. A change at Draft, Screening, Review or Approval past its target implementation date. A non-conformance, ISO finding or audit finding past its due date. An internal or checklist audit past its planned end and still not reported. An open major nonconformity. A live risk whose residual score is above the appetite its owner set.',
        'Due soon: inside the owning app\'s own warning window. An obligation inside its lead time, a document review inside the 30 day window, a temporary change inside 14 days of expiry.',
        'Within a tier, the item that is most days late comes first. An item with no date comes after every dated item in its tier.',
        'A live risk is one that is Open, Under Review, Mitigated or Realized. Draft and Closed risks are not counted. A mitigated risk is still carried, and the hub judges it by its residual score.',
      ],
    },
    {
      id: 'reports',
      title: 'What each number counts',
      bullets: [
        'Exposed now, Overdue and Due soon are counts of items in the Needs attention list. One record can appear more than once if it trips two rules, for example a risk above appetite whose review is also overdue.',
        'Apps reporting is how many of the nine apps the hub could read. An app that could not be read is named in a notice and on its panel. It is never counted as an app with nothing wrong.',
        'The Attention by app chart stacks the same items by app and tier.',
        'Each app panel shows four of that app\'s own dashboard counts, computed by the same function the app\'s dashboard uses.',
        'The CSV holds the rows the list is currently showing, with tier, app, record number, title, reason and days late.',
      ],
    },
    {
      id: 'limits',
      title: 'What the hub does not do',
      bullets: [
        'There is no assurance score, percentage or traffic light for the module as a whole. A single number would hide the items this page exists to name.',
        'It does not edit anything. Every change is made in the owning app.',
        'It does not refresh itself. Press Refresh to read again.',
        'If an app says "Not set up in this environment yet", its database update has not been applied where you are working, so its records cannot be read. That app is left out of every count until it can be.',
        'It shows your organization\'s records only, including for platform administrators.',
      ],
    },
    {
      id: 'faq',
      title: 'Questions',
      bullets: [
        'Why does a record appear twice? It tripped two separate rules, and each is listed with its own reason.',
        'Why is there no overall compliance percentage? Because a percentage cannot tell you which permit has lapsed. The hub lists the items instead.',
        'Why is an app missing from the counts? The hub could not read it. The notice at the top says why.',
        'Why does the hub disagree with an app? It should not: both use the same rules. Refresh the hub, since it reads only when opened or refreshed.',
      ],
    },
  ],
  glossary: [
    { term: 'Exposed now', definition: 'An item that means the organization is exposed today, such as an expired permit or a temporary change running past its expiry.' },
    { term: 'Overdue', definition: 'An item whose own date has passed.' },
    { term: 'Due soon', definition: 'An item inside the owning app\'s warning window.' },
    { term: 'Residual score', definition: 'A risk\'s likelihood times impact after its controls. Until a residual is assessed it equals the inherent score.' },
    { term: 'Appetite', definition: 'The target score a risk owner sets. A residual above it is flagged.' },
    { term: 'Stop-work finding', definition: 'An audit finding that stopped the work at the time it was raised.' },
    { term: 'Apps reporting', definition: 'The number of the nine apps the hub could read.' },
  ],
};
