import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Edit, User, Briefcase, Mail, Phone, Award } from 'lucide-react';

const ResourceList = ({ resources, onEdit }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDiscipline, setFilterDiscipline] = useState('All');

  const disciplines = ['All', ...new Set(resources.map(r => r.discipline))];

  const filteredResources = resources.filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          r.discipline.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (r.skills && r.skills.some(s => s.toLowerCase().includes(searchTerm.toLowerCase())));
    const matchesDiscipline = filterDiscipline === 'All' || r.discipline === filterDiscipline;
    return matchesSearch && matchesDiscipline;
  });

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex flex-wrap gap-4 items-center bg-pl-surface p-3 rounded border border-pl-border">
        <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-pl-muted" />
            <Input 
                placeholder="Search by name, discipline, or skill..." 
                className="pl-8"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
            />
        </div>
        <NativeSelect 
            className="w-auto"
            value={filterDiscipline}
            onChange={e => setFilterDiscipline(e.target.value)}
        >
            {disciplines.map(d => <option key={d} value={d}>{d}</option>)}
        </NativeSelect>
      </div>

      <div className="flex-1 overflow-y-auto bg-pl-surface border border-pl-border rounded-lg">
        <Table>
            <TableHeader className="sticky top-0 z-10">
                <TableRow>
                    <TableHead className="w-[50px]"></TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Discipline</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Availability</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Skills</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {filteredResources.map(resource => (
                    <TableRow key={resource.id} className="border-b border-pl-border hover:bg-pl-sunken/60">
                        <TableCell>
                            <Avatar className="h-8 w-8 bg-pl-sunken border border-pl-border">
                                <AvatarFallback className="text-xs text-pl-text">{resource.name.substring(0,2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                        </TableCell>
                        <TableCell className="font-medium text-pl-text">
                            <div>{resource.name}</div>
                            <div className="text-xs text-pl-muted flex gap-2">
                                {resource.contact_info?.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3"/> {resource.contact_info.email}</span>}
                            </div>
                        </TableCell>
                        <TableCell>
                            <Badge variant="neutral">{resource.discipline}</Badge>
                        </TableCell>
                        <TableCell className="text-pl-muted text-sm">{resource.type}</TableCell>
                        <TableCell>
                            <div className="flex items-center gap-2">
                                <div aria-hidden="true" className={`w-2 h-2 rounded-full ${resource.availability_percent > 80 ? 'bg-pl-success' : resource.availability_percent > 20 ? 'bg-pl-warning' : 'bg-pl-danger'}`} />
                                <span className="text-sm font-pl-mono tabular-nums text-pl-text">{resource.availability_percent}%</span>
                            </div>
                        </TableCell>
                        <TableCell className="text-pl-text font-pl-mono tabular-nums text-sm">${resource.cost_per_day}/day</TableCell>
                        <TableCell>
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                                {resource.skills && resource.skills.slice(0, 2).map(skill => (
                                    <span key={skill} className="text-[10px] px-1.5 py-0.5 bg-pl-sunken rounded border border-pl-border text-pl-muted">{skill}</span>
                                ))}
                                {resource.skills && resource.skills.length > 2 && <span className="text-[10px] text-pl-muted">+{resource.skills.length - 2} more</span>}
                            </div>
                        </TableCell>
                        <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => onEdit(resource)} className="h-8 w-8 p-0 text-pl-muted hover:text-pl-text">
                                <Edit className="w-4 h-4" />
                            </Button>
                        </TableCell>
                    </TableRow>
                ))}
                {filteredResources.length === 0 && (
                    <TableRow><TableCell colSpan="8" className="text-center py-10 text-pl-muted">No resources found.</TableCell></TableRow>
                )}
            </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default ResourceList;