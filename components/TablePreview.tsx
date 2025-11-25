import React from 'react';
import { ExtractedTable } from '../types';
import { Trash2, X } from 'lucide-react';

interface TablePreviewProps {
  tables: ExtractedTable[];
  onDeleteRow?: (tableIndex: number, rowIndex: number) => void;
  onDeleteColumn?: (tableIndex: number, colIndex: number) => void;
}

const TablePreview: React.FC<TablePreviewProps> = ({ tables, onDeleteRow, onDeleteColumn }) => {
  if (tables.length === 0) {
    return (
      <div className="text-center py-16 text-stone-400 dark:text-stone-500 bg-white dark:bg-stone-800/40 rounded-2xl border border-stone-200 dark:border-stone-700 border-dashed">
        <p>Nie znaleziono tabel w tym dokumencie.</p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {tables.map((table, tableIndex) => (
        <div key={tableIndex} className="bg-white border border-stone-200 rounded-xl shadow-sm overflow-hidden dark:bg-stone-800 dark:border-stone-700 ring-1 ring-black/5">
          {table.title && (
            <div className="bg-stone-50 px-6 py-4 border-b border-stone-200 dark:bg-stone-900 dark:border-stone-700 flex items-center gap-2">
               <div className="w-1 h-4 bg-emerald-500 rounded-full"></div>
               <h3 className="text-sm font-bold text-stone-700 uppercase tracking-wider dark:text-stone-300 font-sans">
                {table.title}
              </h3>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200 dark:divide-stone-700 table-fixed">
              {table.headers && table.headers.length > 0 && (
                <thead className="bg-stone-100 dark:bg-stone-900/80">
                  {/* Column Delete Tools Row */}
                  {onDeleteColumn && (
                    <tr>
                      <th className="w-10 bg-stone-50 border-b border-r border-stone-200 dark:bg-stone-900 dark:border-stone-700"></th>
                      {table.headers.map((_, colIndex) => (
                        <th key={`del-col-${colIndex}`} className="px-2 py-1 border-b border-r border-stone-200 last:border-r-0 dark:border-stone-700 text-center bg-stone-50 dark:bg-stone-900">
                          <button
                            onClick={() => onDeleteColumn(tableIndex, colIndex)}
                            className="p-1 rounded hover:bg-red-100 text-stone-400 hover:text-red-600 transition-colors"
                            title="Usuń kolumnę"
                          >
                            <X size={14} />
                          </button>
                        </th>
                      ))}
                    </tr>
                  )}
                  <tr>
                    {/* Row Delete Header Placeholder */}
                    {onDeleteRow && (
                       <th className="w-10 px-2 border-r border-stone-200 dark:border-stone-700 bg-stone-100 dark:bg-stone-900">
                          <span className="sr-only">Akcje</span>
                       </th>
                    )}
                    {table.headers.map((header, hIndex) => (
                      <th
                        key={hIndex}
                        scope="col"
                        className="px-6 py-4 text-left text-xs font-semibold text-stone-600 uppercase tracking-wider border-r border-stone-200 last:border-0 dark:text-stone-400 dark:border-stone-700 break-words"
                        style={{ minWidth: '120px' }}
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody className="bg-white divide-y divide-stone-100 dark:bg-stone-800 dark:divide-stone-700">
                {table.rows.map((row, rIndex) => (
                  <tr key={rIndex} className="hover:bg-emerald-50/50 transition-colors dark:hover:bg-emerald-900/10 even:bg-stone-50/30 dark:even:bg-stone-900/20 group">
                    {/* Row Delete Button */}
                    {onDeleteRow && (
                        <td className="w-10 px-2 py-2 text-center border-r border-stone-100 dark:border-stone-700/50">
                            <button
                                onClick={() => onDeleteRow(tableIndex, rIndex)}
                                className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-100 text-stone-400 hover:text-red-600 transition-all"
                                title="Usuń wiersz"
                            >
                                <Trash2 size={14} />
                            </button>
                        </td>
                    )}
                    {row.map((cell, cIndex) => (
                      <td key={cIndex} className="px-6 py-4 text-sm text-stone-700 border-r border-stone-100 last:border-0 whitespace-pre-wrap dark:text-stone-300 dark:border-stone-700/50 break-words">
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