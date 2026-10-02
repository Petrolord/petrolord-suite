// The help text of organisation sharing, the same in every app's help guide
// (docs/scope/OrgSharing-DESIGN-AND-STATUS.md). Copy rule: no em dashes, no
// "X, not Y" contrastives.

import React from 'react';
import { SubHeading, Para, Callout, Table } from '@/components/helpguide/HelpGuideLayout';

/**
 * @param {{
 *   record: string,        what the app calls the record ("model", "section", "well")
 *   where: string,         where the control is in this app
 *   editing?: boolean,     false where colleagues can only view (no "Colleagues can edit")
 *   children?: React.ReactNode,  what is particular to this app
 * }} props
 */
export default function SharingHelp({ record, where, editing = true, children = null }) {
  return (
    <div data-testid="sharing-help">
      <SubHeading>Sharing with your organisation</SubHeading>
      <Para>
        A {record} is private until its owner shares it. {where} Switch on <strong>Share with my organisation</strong> and
        every member of your organisation can open the {record}{editing ? '. Then choose what colleagues may do with it.' : ' and save a copy of their own.'}
      </Para>
      {editing && (
        <Table headers={['Setting', 'What colleagues can do']} rows={[
          ['Colleagues can view', `Open the ${record} read-only and use Save a copy to work on a version of their own.`],
          ['Colleagues can edit', `Change the ${record} itself, one person at a time. Whoever wants to edit presses Start editing; everyone else sees "Being edited by" with the name and the time, and stays read-only until that person presses Done editing.`],
        ]} />
      )}
      {editing && (
        <Para>
          An editing session ends when you press Done editing, when you close the {record}, or 30 minutes after your last save
          if you walk away. The owner can press Take over to end a colleague's session; that is written in the history.
          Two people editing at the same moment is not supported.
        </Para>
      )}
      <Para>
        Every save records who made it. If someone saved a newer version after you opened the {record}, your save is refused
        with their name and the time, and you choose to reload or to save yours as a copy, so nothing is overwritten
        unseen. <strong>History</strong> lists who created, shared, edited and saved the {record}, and when. Names are shown
        inside your organisation only.
      </Para>
      {children}
      <Callout tone="info" title="Only the owner">
        Only the owner shares or unshares a {record}, changes what colleagues can do, and deletes it. Other organisations never see it.
        If the control shows a note that sharing is not switched on yet, your database is waiting for an update and everything stays private.
      </Callout>
    </div>
  );
}
