import React from 'react';
import { ExtractedTable } from '../types';

interface TablePreviewProps {
  tables: ExtractedTable[];
}

const TablePreview: React.FC<TablePreviewProps> = ({ tables }) => {
  if (tables.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <p>Nie znaleziono tabel w tym dokumencie.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {tables.map((table, tableIndex) => (
        <div key={tableIndex} className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          {table.title && (
            <div className="bg-slate-50 px-6 py-3 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
                {table.title}
              </h3>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              {table.headers && table.headers.length > 0 && (
                <thead className="bg-slate-50">
                  <tr>
                    {table.headers.map((header, hIndex) => (
                      <th
                        key={hIndex}
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider border-r border-slate-100 last:border-0"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody className="bg-white divide-y divide-slate-200">
                {table.rows.map((row, rIndex) => (
                  <tr key={rIndex} className="hover:bg-slate-50 transition-colors">
                    {row.map((cell, cIndex) => (
                      <td key={cIndex} className="px-6 py-4 text-sm text-slate-700 border-r border-slate-100 last:border-0 whitespace-pre-wrap">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
};

export default TablePreview;