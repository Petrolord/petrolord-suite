// The "Local workspace" help section, shared by the Seismolord and QI Studio
// guides so both say the same thing. Copy rule: no em dashes, no "X, not Y".
import React from 'react';
import { HardDrive } from 'lucide-react';
import {
  GuideSection, SectionHeading, SubHeading, Para, Callout, Step, Table,
} from '@/components/helpguide/HelpGuideLayout';
import { BROWSER_KINDS } from '@/lib/localWorkspace/router';

const KIND_WORDS = {
  attribute_volume: 'Attribute volumes',
  seismic_qc: 'Seismic QC',
  poststack_inversion: 'Post-stack impedance inversion',
  property_prediction: 'Property prediction',
  sample_volumes: 'Stack traces at the wells',
  avo_volumes: 'AVO from angle stacks',
  match_stacks: 'Stack matching',
  spectral_balance: 'Balancing the stack spectra',
  prestack_inversion: 'Simultaneous inversion of angle stacks',
  zone_maps: 'Zone maps',
};

export const LOCAL_WORKSPACE_SECTION = { id: 'local-workspace', icon: HardDrive, title: 'Local workspace: seismic on your computer' };

export default function LocalWorkspaceHelp() {
  return (
    <GuideSection id="local-workspace">
      <SectionHeading icon={HardDrive}>Local workspace: seismic on your computer</SectionHeading>
      <Para>
        Large seismic can stay on your own computer. An import to this computer reads the SEG-Y from your disk and writes the
        volume into a folder you choose, so nothing of the seismic is uploaded, however slow your link. Attributes, QC,
        inversion and the QI steps then run here in the browser with the same code the Petrolord servers run, and give the
        same result to the last bit. Horizons, faults, wells, ties, every result summary and the report still save to the
        cloud, under the same project and sharing rules as before.
      </Para>
      <SubHeading>Set it up once</SubHeading>
      <Step n={1} title="Open Local workspace">Open Local workspace (the Home ribbon in Seismolord, or the Setup tab in QI Studio).</Step>
      <Step n={2} title="Name this computer">Type the name colleagues will see for this computer, for example Ayo&apos;s PC.</Step>
      <Step n={3} title="Choose the folder">Choose a folder on a large drive, for example D:\Petrolord. When the browser asks, choose Allow on every visit so it stops asking after a restart.</Step>
      <Callout tone="info" title="Which browser">
        Chrome and Edge keep volumes in the folder you choose. Firefox and Safari can only keep them inside the browser&apos;s
        own storage: clearing site data deletes them, Firefox stops at about 10 GB unless it is allowed to keep data, and
        the app says so. For large studies use Chrome or Edge.
      </Callout>
      <SubHeading>Import with no upload</SubHeading>
      <Para>
        In the import dialog, Where the seismic lives offers Keep on this computer and Upload to Petrolord, with the time
        each takes and the disk the local copy needs (about 1.3 times the SEG-Y). A new project asks once and remembers the
        choice (Projects, Seismic storage); a project with no choice yet defaults to this computer. The crop step works the
        same for both. Volumes imported before stay where they are.
      </Para>
      <Para>
        What goes to the cloud for a local volume: its record (name, geometry, statistics, the identity hashes, this
        computer&apos;s name and the project), its manifest of a few KB and, unless the project is members-only or you turn
        it off, three small preview images (an inline, a crossline and a time slice). Turn previews on or off per volume
        from its menu in the Seismic Explorer.
      </Para>
      <SubHeading>Where each volume lives</SubHeading>
      <Table
        headers={['Badge', 'Meaning']}
        rows={[
          ['This computer', 'Stored here only. It opens and computes here.'],
          ['Both', 'Here and in the cloud: it opens on any computer.'],
          ['A computer name', 'It lives on that computer. You see its horizons, faults and preview, and can ask its owner for a cloud copy.'],
          ['Missing here', 'This computer held it but the files are gone (site data or the folder was cleared). The record and the interpretation are safe; import the SEG-Y again to restore it.'],
        ]}
      />
      <SubHeading>Jobs on this computer</SubHeading>
      <Para>
        A job whose volumes are on this computer runs here; one on cloud volumes runs on the Petrolord servers unless you
        choose Always on this computer in Local workspace. Keep the tab open while jobs run here (the screen stays awake);
        several run side by side. Every job is listed in the jobs panel and the audit trail with where it ran. If the tab
        closes mid-job, the next visit marks it closed and removes the partial result, and you run it again. These run
        here:
      </Para>
      <Table headers={['Step']} rows={BROWSER_KINDS.map((k) => [KIND_WORDS[k] || k])} />
      <Para>Steps that read prestack gathers need Petrolord Local, a small helper planned after NAPE; until then run them on gathers in the cloud.</Para>
      <SubHeading>Sharing with colleagues</SubHeading>
      <Para>
        Seismic is never streamed from your computer to a colleague. When a colleague asks for a copy, the request appears
        under Copy requests in your Local workspace; Upload a cloud copy sends it with the resumable upload and the volume
        becomes Both. You can also choose Copy to the cloud from a volume&apos;s menu at any time. A cloud copy counts against
        the cloud storage from then on.
      </Para>
      <Callout tone="warn" title="Keeping data on a laptop">
        Local volumes are ordinary files on your computer and Petrolord cannot see or recover them. Turn on disk encryption
        (BitLocker on Windows, FileVault on a Mac), back the workspace folder up with your own tools, and remember that a
        lost laptop without encryption exposes the client&apos;s data.
      </Callout>
    </GuideSection>
  );
}
