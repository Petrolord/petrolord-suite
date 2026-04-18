import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { FolderTree } from 'lucide-react';

const CategoryManagement = () => (
    <Card className="bg-slate-950 border-slate-800 m-1">
        <CardContent className="p-6 text-center">
            <FolderTree className="w-12 h-12 mx-auto text-slate-600 mb-4" />
            <h3 className="text-lg font-bold text-slate-200">Category Taxonomy</h3>
            <p className="text-sm text-slate-500 mt-2">Drag and drop to reorganize the knowledge hierarchy.</p>
            <div className="mt-4 p-4 border border-dashed border-slate-800 rounded bg-slate-900/50 text-xs text-slate-400">
                Root {'>'} Engineering {'>'} Tutorials {'>'} Basic
            </div>
        </CardContent>
    </Card>
);
export default CategoryManagement;