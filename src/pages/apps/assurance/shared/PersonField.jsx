import React from 'react';
import { Input } from '@/components/ui/input';
import { memberName } from './people';

/**
 * AS13 — pick a Suite member, or type the name of somebody without an
 * account.
 *
 * Picking a member sets the id, which is what the independence rules
 * compare. Typing a name keeps the external path the engine allows (an
 * external person is named in text), and the form compares typed names
 * itself.
 *
 * onChange receives `{ id, name }`: a member's user id and their name,
 * or `{ id: null, name: <typed> }`.
 */
export const PersonField = ({
  id, label, members = [], personId, name, onChange, userId = null,
  emptyOption = 'Somebody without a Suite account (type the name)',
  namePlaceholder = 'Their name', error, hint, className = '', labelClassName = 'text-sm font-medium',
  selectClassName = 'h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm',
}) => {
  const listed = personId && members.some((m) => m.user_id === personId);
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className={labelClassName} htmlFor={id}>{label}</label>
      <select
        id={id}
        className={selectClassName}
        value={listed ? personId : ''}
        onChange={(e) => {
          const member = members.find((m) => m.user_id === e.target.value);
          onChange(member ? { id: member.user_id, name: memberName(member) } : { id: null, name: '' });
        }}
      >
        <option value="">{emptyOption}</option>
        {members.map((m) => (
          <option key={m.user_id} value={m.user_id}>
            {memberName(m)}{m.user_id === userId ? ' (you)' : ''}
          </option>
        ))}
      </select>
      {!listed ? (
        <Input
          id={`${id}-name`}
          aria-label={`${label}: name`}
          value={name || ''}
          placeholder={namePlaceholder}
          onChange={(e) => onChange({ id: null, name: e.target.value })}
        />
      ) : null}
      {hint ? <p className="text-xs text-[hsl(var(--muted-foreground))]">{hint}</p> : null}
      {error ? <p className="text-xs text-[hsl(var(--destructive))]">{error}</p> : null}
    </div>
  );
};

export default PersonField;
