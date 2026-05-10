import { ReactNode } from 'react';

type DataTableProps = {
  columns: string[];
  children: ReactNode;
};

export function DataTable({ columns, children }: DataTableProps) {
  return (
    <div className="card overflow-visible p-0">
      <div className="overflow-x-auto overflow-y-visible">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-4 py-3 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">{children}</tbody>
        </table>
      </div>
    </div>
  );
}
