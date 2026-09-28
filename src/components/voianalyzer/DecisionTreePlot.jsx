// VOI decision tree diagram (Economics E2).
//
// This was a "Chart removed" placeholder: the app computed a decision tree
// and then showed the user an empty box where the picture should be. It now
// draws the real tree, using the same component as the Decision Tree Builder,
// so both apps render decision analysis the same way and the diagram comes
// from the same rollback that produced the numbers above it.
import React from 'react';
import TreeDiagram from '@/components/decisiontree/TreeDiagram';

const DecisionTreePlot = ({ tree }) => {
  if (!tree) {
    return (
      <div className="bg-pl-warning-bg border border-pl-warning/40 text-pl-warning-text p-4 rounded-lg h-[400px] flex items-center justify-center text-sm text-center px-8">
        The diagram is withheld because the indicator numbers contradict the stated
        outcome chances. Decision Guidance below explains what they imply and how to
        make them agree.
      </div>
    );
  }
  return (
    <TreeDiagram annotated={tree} unit="$MM" />
  );
};

export default DecisionTreePlot;
