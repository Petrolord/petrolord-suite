// Starter templates for the Decision Tree Builder (D3). Values are in $MM.
import { buildInformationTree } from '@/lib/decisionTree';

let idCounter = 1;
export const nextId = () => `n${idCounter++}`;

// Stamp ids onto a tree built without them (buildInformationTree output).
const withIds = (node) => ({
  id: nextId(),
  ...node,
  branches: node.branches?.map((b) => ({ ...b, node: withIds(b.node) })),
});

export const terminalNode = (label = 'Outcome', payoff = 0) => ({
  id: nextId(), type: 'terminal', label, payoff,
});

export const chanceNode = (label = 'Chance event') => ({
  id: nextId(), type: 'chance', label,
  branches: [
    { label: 'Success', probability: 0.5, node: terminalNode('Success', 100) },
    { label: 'Failure', probability: 0.5, node: terminalNode('Failure', -20) },
  ],
});

export const decisionNode = (label = 'Decision') => ({
  id: nextId(), type: 'decision', label,
  branches: [
    { label: 'Option A', cost: 0, node: terminalNode('Option A result', 0) },
  ],
});

export const TEMPLATES = {
  blank: {
    name: 'Blank tree',
    build: () => ({
      id: nextId(), type: 'decision', label: 'Root decision',
      branches: [
        { label: 'Option A', cost: 0, node: terminalNode('Result A', 0) },
        { label: 'Option B', cost: 0, node: terminalNode('Result B', 0) },
      ],
    }),
  },

  drillFarmOut: {
    name: 'Drill vs farm out (prospect EMV)',
    build: () => ({
      id: nextId(), type: 'decision', label: 'Prospect decision',
      branches: [
        {
          label: 'Drill', cost: 40,
          node: {
            id: nextId(), type: 'chance', label: 'Drill outcome',
            branches: [
              { label: 'Success', probability: 0.3, node: terminalNode('Success', 300) },
              { label: 'Dry hole', probability: 0.7, node: terminalNode('Dry hole', -10) },
            ],
          },
        },
        {
          label: 'Farm out', cost: 0,
          node: {
            id: nextId(), type: 'chance', label: 'Farm-out outcome',
            branches: [
              { label: 'Success', probability: 0.3, node: terminalNode('Carried success', 60) },
              { label: 'Dry hole', probability: 0.7, node: terminalNode('Dry hole', 0) },
            ],
          },
        },
        { label: 'Do nothing', cost: 0, node: terminalNode('Walk away', 0) },
      ],
    }),
  },

  valueOfInformation: {
    name: 'Value of information (Bayes-derived)',
    build: () => withIds(buildInformationTree({
      outcomes: [
        { label: 'Success', probability: 0.3 },
        { label: 'Dry hole', probability: 0.7 },
      ],
      actions: [
        { label: 'Drill', cost: 40, payoffs: [300, -10] },
        { label: 'Farm out', cost: 0, payoffs: [60, 0] },
        { label: 'Do nothing', cost: 0, payoffs: [0, 0] },
      ],
      signals: [
        { label: 'Positive seismic', likelihoods: [0.8, 0.3] },
        { label: 'Negative seismic', likelihoods: [0.2, 0.7] },
      ],
      infoCost: 5,
      infoLabel: 'Acquire 3D seismic',
    })),
  },
};
