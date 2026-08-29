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
      <div className="bg-white/5 p-4 rounded-lg h-[400px] flex items-center justify-center text-slate-400 text-sm text-center px-8">
        The tree could not be drawn from these inputs. The values above are unaffected;
        check that each indicator&apos;s outcome chances sum to 100 percent.
      </div>
    );
  }
  return (
    <div className="bg-white/5 p-2 rounded-lg">
      <TreeDiagram annotated={tree} unit="$MM" />
    </div>
  );
};

export default DecisionTreePlot;
