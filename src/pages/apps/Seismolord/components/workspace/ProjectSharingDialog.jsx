// U2-008: sharing and history of one Seismolord project (an explorer
// folder), on the shared control every Geoscience app uses
// (src/components/recordSharing). A project shared with the organisation
// shows a colleague the folder and, inside it, the volumes that are
// themselves shared with the organisation: volumes stay shared one by one,
// with everyone's horizons and faults on them. So the dialog says how many
// of the project's volumes a colleague will see.

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { RecordSharingBar, useRecordSharing } from '@/components/recordSharing';

/**
 * @param {{
 *   project: ?Object,          the seismic_projects row (null closes the dialog)
 *   volumes: Object[],         the volumes this user can see (own and shared)
 *   store: Object,             the sharing store
 *   onClose: () => void,
 *   onChange: (sharing: Object) => void,
 *   onSaveCopy: (project: Object) => void,
 *   onReload: () => void,
 * }} props
 */
export default function ProjectSharingDialog({ project, volumes = [], store, onClose, onChange, onSaveCopy, onReload }) {
  const sharing = useRecordSharing({ store, table: 'seismic_projects', record: project, onChange });
  const mine = !!project && !!sharing.userId && project.user_id === sharing.userId;
  const inProject = project ? volumes.filter((v) => v.project_id === project.id && !v.parent_volume_id) : [];
  const privateOnes = inProject.filter((v) => v.is_own && !v.organization_id);
  return (
    <Dialog open={!!project} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl" data-testid="seis-project-sharing">
        <DialogHeader>
          <DialogTitle>{project?.name || 'Project'}</DialogTitle>
          <DialogDescription>
            A project is an explorer folder. Sharing it shows colleagues the folder and the volumes in it that are shared with your organisation.
          </DialogDescription>
        </DialogHeader>
        <RecordSharingBar
          sharing={sharing}
          label="project"
          onSaveCopy={mine ? null : () => onSaveCopy(project)}
          onReload={onReload}
          fieldLabels={{ name: 'the name', description: 'the description' }}
        />
        {project && sharing.ready && sharing.available && mine && sharing.access.shared && (
          <p className="text-xs text-pl-muted" data-testid="seis-project-volumes-note">
            {inProject.length === 0 && 'This project has no volumes yet. File a volume under it from the volume\'s menu.'}
            {inProject.length > 0 && privateOnes.length === 0 && `Colleagues see all ${inProject.length} volume${inProject.length === 1 ? '' : 's'} of this project, read-only, with the interpretations on them.`}
            {privateOnes.length > 0 && `${privateOnes.length} of ${inProject.length} volume${inProject.length === 1 ? '' : 's'} in this project ${privateOnes.length === 1 ? 'is' : 'are'} private (${privateOnes.map((v) => v.name).join(', ')}). Colleagues will not see ${privateOnes.length === 1 ? 'it' : 'them'} until you share ${privateOnes.length === 1 ? 'it' : 'each one'} from its menu ("Share with organization").`}
          </p>
        )}
        {project && sharing.ready && !mine && (
          <p className="text-xs text-pl-muted" data-testid="seis-project-volumes-note">
            {inProject.length > 0
              ? `You can open ${inProject.length} volume${inProject.length === 1 ? '' : 's'} of this project. Only volumes shared with your organisation are listed; the owner may keep others private.`
              : 'No volume of this project is shared with your organisation yet, so there is nothing to open. Ask the owner to share the volumes.'}
            {sharing.access.sharedEdit ? ' Editing here means renaming the project; each interpreter\'s horizons and faults stay their own.' : ''}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
