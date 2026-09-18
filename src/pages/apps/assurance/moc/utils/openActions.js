/**
 * ASC-0 (RC-7): a change's open actions, as the engine counts them.
 *
 * The Register and Reports CSVs counted every unfinished action on a
 * change, including those on Closed, Rejected and Cancelled changes. The
 * dashboard reads `summarise().openActions`, which leaves those out
 * (AS14: a finished change is locked, so its unfinished actions are not
 * work anybody can do). This asks the same engine function about one
 * change, so the CSV column and the dashboard tile cannot disagree.
 */
import { summarise } from '@/lib/managementOfChange';

export const openActionsOf = (moc = {}, today = new Date()) => {
  // Each action is tied to this change, so an action row read without
  // its moc_id still belongs to the record it was listed under.
  const actions = (moc.actions || []).map((a) => ({ ...a, moc_id: moc.id }));
  return summarise([moc], { actions }, today).openActions;
};
