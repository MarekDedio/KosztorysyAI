import React, { useState, useCallback, useEffect } from 'react';
import { FileDown, Loader2, Table as TableIcon, RefreshCw, Trash2, Calculator, Coins, Settings2, ChevronDown, ChevronUp } from 'lucide-react';
import Dropzone from './components/Dropzone';
import TablePreview from './components/TablePreview';
import { extractTablesFromDocx } from './services/geminiService';
import { processTablesWithPricing, DEFAULT_PRICING_SCHEDULE } from './services/pricingCalculator';
import { ExtractionResult, ProcessingStatus, CalculatedTotals } from './types';

const App: React.FC = () => {
  const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  const [rawResult, setRawResult] = useState<ExtractionResult | null>(null); // Store raw extraction
  const [result, setResult] = useState<ExtractionResult | null>(null); // Store processed result
  const [totals, setTotals] = useState<CalculatedTotals | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Options
  const [removeUoRows, setRemoveUoRows] = useState<boolean>(false);
  const [preserveLp, setPreserveLp] = useState<boolean>(false); // Default to false (Renumber)
  
  const [weBasePrice, setWeBasePrice] = useState<number>(800);
  
  // Specific WE options
  const [useSpecificWePrices, setUseSpecificWePrices] = useState<boolean>(false);
  const [w2tPrice, setW2tPrice] = useState<number>(800);
  const [w4tPrice, setW4tPrice] = useState<number>(800);

  // CS Customization Options
  const [useCustomCsPricing, setUseCustomCsPricing] = useState<boolean>(false);
  const [csMultiplier, setCsMultiplier] = useState<number>(1.0);
  const [customCsPrices, setCustomCsPrices] = useState<number[]>(DEFAULT_PRICING_SCHEDULE.map(t => t.price));

  const handleFileSelected = useCallback(async (file: File) => {
    setStatus(ProcessingStatus.PROCESSING);
    setErrorMsg(null);
    setFileName(file.name);
    setTotals(null);
    setRawResult(null);
    setResult(null);
    
    try {
      // 1. Extract raw tables
      const extractionResult = await extractTablesFromDocx(file);
      setRawResult(extractionResult);
      // The useEffect below will handle processing
    } catch (error) {
      console.error(error);
      setErrorMsg("Nie udało się przetworzyć dokumentu. Sprawdź, czy plik nie jest uszkodzony i spróbuj ponownie.");
      setStatus(ProcessingStatus.ERROR);
    }
  }, []);

  // Effect to re-calculate when options or raw data changes
  useEffect(() => {
    if (rawResult) {
      const { processedTables, totals: calculatedTotals } = processTablesWithPricing(rawResult.tables, {
        removeUoRows,
        preserveLp,
        weBasePrice,
        useSpecificWePrices,
        w2tPrice,
        w4tPrice,
        useCustomCsPricing,
        csMultiplier,
        customCsPrices
      });
      setResult({ 
        tables: processedTables,
        metadata: rawResult.metadata
      });
      setTotals(calculatedTotals);
      setStatus(ProcessingStatus.SUCCESS);
    }
  }, [
    rawResult, 
    removeUoRows, 
    preserveLp,
    weBasePrice, 
    useSpecificWePrices, 
    w2tPrice, 
    w4tPrice, 
    useCustomCsPricing, 
    csMultiplier, 
    customCsPrices
  ]);

  const handleReset = () => {
    setStatus(ProcessingStatus.IDLE);
    setResult(null);
    setRawResult(null);
    setTotals(null);
    setFileName("");
    setErrorMsg(null);
    // We do not reset options here so the user's preference persists
  };

  const updateCustomCsPrice = (index: number, value: number) => {
    const newPrices = [...customCsPrices];
    newPrices[index] = value;
    setCustomCsPrices(newPrices);
  };

  const handleDownload = () => {
    if (!result) return;

    // Metadata Strings with fallback
    const title = result.metadata?.title || "KOSZTORYS NA WYKONANIE PRAC PIELĘGNACYJNYCH DRZEWOSTANU";
    const location = result.metadata?.location || "BRAK INFORMACJI";
    const details = result.metadata?.administrativeDetails || "BRAK INFORMACJI";

    // Generate HTML for tables
    const tablesHtml = result.tables.map(table => `
      <div class="table-container">
        ${table.title ? `<h3>${table.title}</h3>` : ''}
        <table border="1" style="border-collapse: collapse; width: 100%; margin-bottom: 0;">
          <tbody>
            ${table.headers && table.headers.length > 0 ? `
            <tr style="background-color: #f0f0f0; font-weight: bold;">
              ${table.headers.map(h => `<td style="padding: 8px;">${h}</td>`).join('')}
            </tr>` : ''}
            ${table.rows.map(row => `
              <tr>
                ${row.map(cell => `<td style="padding: 8px;">${cell}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `).join('<br/>');

    // Add Summary Section at the END of the document as an "added row" table
    const summaryHtml = totals ? `
      <br/>
      <table border="1" style="border-collapse: collapse; width: 100%; margin-top: 0;">
        <tbody>
          <tr style="background-color: #e9ecef; font-weight: bold;">
            <td style="padding: 8px; text-align: right; border: 1px solid #ddd;">RAZEM CAŁOŚĆ:</td>
            <td style="padding: 8px; border: 1px solid #ddd; width: 150px;">Netto: ${totals.totalNetto.toFixed(2)} PLN</td>
            <td style="padding: 8px; border: 1px solid #ddd; width: 150px;">Brutto: ${totals.totalBrutto.toFixed(2)} PLN</td>
          </tr>
        </tbody>
      </table>
    ` : '';

    const fullHtml = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset="utf-8">
        <title>Kosztorys</title>
        <style>
          @page {
            size: 29.7cm 21cm; /* A4 Landscape */
            mso-page-orientation: landscape;
            margin: 1.5cm;
          }
          div.Section1 {
            page: Section1;
          }
          body { 
            font-family: 'Arial', sans-serif; 
            line-height: 1.6; 
            color: #000; 
          }
          table { border-collapse: collapse; width: 100%; }
          /* Font size 10 inside tables */
          th, td { 
            border: 1px solid #000; 
            padding: 8px; 
            font-size: 10pt; 
          }
          
          .header-section {
            text-align: center;
            margin-bottom: 30px;
          }
          h1 {
            font-size: 18pt;
            font-weight: bold;
            text-transform: uppercase;
            margin-bottom: 10px;
          }
          .location {
            font-size: 14pt;
            font-weight: bold;
            margin-bottom: 5px;
          }
          .details {
            font-size: 12pt;
            font-weight: normal;
          }
        </style>
      </head>
      <body>
        <div class="Section1">
          <div class="header-section">
            <h1>${title}</h1>
            <div class="location">${location}</div>
            <div class="details">${details}</div>
          </div>
          
          ${tablesHtml}
          ${summaryHtml}
        </div>
      </body>
      </html>
    `;

    const blob = new Blob([fullHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kalkulacja_${fileName}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-600">
            <TableIcon className="h-6 w-6" />
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Kalkulator Drzewostanu AI</h1>
          </div>
          <div className="text-sm text-slate-500 hidden sm:block">
             Powered by Gemini 2.5
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-12">
        
        {status === ProcessingStatus.IDLE && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-8 animate-in fade-in zoom-in duration-500">
            <div className="text-center max-w-2xl">
              <h2 className="text-3xl font-bold text-slate-900 mb-4">
                Wygeneruj Kosztorys
              </h2>
              <p className="text-lg text-slate-600">
                Prześlij plik .docx. Program obliczy koszty dla CS (na podstawie obwodu) oraz wiązań (WE/W2t/W4t).
              </p>
            </div>
            <div className="w-full max-w-3xl mx-auto space-y-6">
              <Dropzone onFileSelected={handleFileSelected} />
              
              <div className="grid grid-cols-1 gap-4">
                {/* 1. Filter Uo Option */}
                <div className="flex flex-col p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all">
                  <label className="flex items-center gap-3 cursor-pointer group select-none">
                    <div className="relative flex items-center shrink-0">
                      <input 
                        type="checkbox" 
                        className="peer sr-only" 
                        checked={removeUoRows}
                        onChange={(e) => setRemoveUoRows(e.target.checked)}
                      />
                      <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-focus:ring-4 peer-focus:ring-blue-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </div>
                    <span className="text-slate-700 font-medium group-hover:text-blue-700 transition-colors">
                      Pomiń drzewa do usunięcia
                    </span>
                  </label>
                  
                  {/* Sub-option: Preserve Lp */}
                  {removeUoRows && (
                    <div className="ml-14 mt-2 animate-in fade-in slide-in-from-top-1">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                         <input 
                            type="checkbox"
                            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                            checked={preserveLp}
                            onChange={(e) => setPreserveLp(e.target.checked)}
                         />
                         <span className="text-sm text-slate-600">Zachowaj oryginalne Lp.</span>
                      </label>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* 2. WE Pricing Options */}
                  <div className="flex flex-col p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all space-y-4">
                    <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                      <Settings2 size={16} className="text-blue-500"/> Cennik Wiązań (WE)
                    </h3>
                    
                    {/* Base WE Price */}
                    <div className="flex flex-col">
                      <label className="text-sm font-medium text-slate-600 mb-1">
                         Cena bazowa (WE)
                      </label>
                      <div className="relative">
                        <input 
                          type="number" 
                          min="0"
                          value={weBasePrice}
                          onChange={(e) => setWeBasePrice(Number(e.target.value))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white text-slate-900"
                        />
                        <span className="absolute right-3 top-2 text-slate-400 text-sm">PLN</span>
                      </div>
                    </div>

                    {/* Specific Pricing Toggle */}
                    <label className="flex items-center gap-2 cursor-pointer select-none pt-2 border-t border-slate-100">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                        checked={useSpecificWePrices}
                        onChange={(e) => setUseSpecificWePrices(e.target.checked)}
                      />
                      <span className="text-sm font-medium text-slate-700">
                        Rozróżnij ceny dla W2t / W4t
                      </span>
                    </label>

                    {/* Conditional W2t/W4t Inputs */}
                    {useSpecificWePrices && (
                      <div className="grid grid-cols-2 gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex flex-col">
                          <label className="text-xs font-medium text-slate-500 mb-1">Cena W2t</label>
                          <div className="relative">
                            <input 
                              type="number" 
                              min="0"
                              value={w2tPrice}
                              onChange={(e) => setW2tPrice(Number(e.target.value))}
                              className="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:ring-blue-500 outline-none bg-white text-slate-900"
                            />
                          </div>
                        </div>
                        <div className="flex flex-col">
                          <label className="text-xs font-medium text-slate-500 mb-1">Cena W4t</label>
                          <div className="relative">
                            <input 
                              type="number" 
                              min="0"
                              value={w4tPrice}
                              onChange={(e) => setW4tPrice(Number(e.target.value))}
                              className="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:ring-blue-500 outline-none bg-white text-slate-900"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 3. CS Pricing Options */}
                  <div className="flex flex-col p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                        <Settings2 size={16} className="text-blue-500"/> Cennik CS
                      </h3>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                          checked={useCustomCsPricing}
                          onChange={(e) => setUseCustomCsPricing(e.target.checked)}
                        />
                        <span className="text-sm font-medium text-slate-700">
                          Edytuj
                        </span>
                      </label>
                    </div>

                    {!useCustomCsPricing ? (
                       <p className="text-sm text-slate-500 italic py-4">Używany standardowy cennik dla przedziałów obwodu.</p>
                    ) : (
                      <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        
                        {/* Global Multiplier */}
                        <div className="flex flex-col pb-3 border-b border-slate-100">
                          <label className="text-sm font-medium text-slate-600 mb-1">
                             Mnożnik dla wszystkich cen CS
                          </label>
                          <div className="relative">
                            <input 
                              type="number" 
                              step="0.1"
                              min="0"
                              value={csMultiplier}
                              onChange={(e) => setCsMultiplier(Number(e.target.value))}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white text-slate-900"
                            />
                            <span className="absolute right-3 top-2 text-slate-400 text-sm">x</span>
                          </div>
                        </div>
                        
                        {/* Individual Prices Scrollable Area */}
                        <div className="max-h-[200px] overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                           <p className="text-xs font-semibold text-slate-500 uppercase mb-2 sticky top-0 bg-white py-1">Ceny bazowe (przed mnożnikiem)</p>
                           {DEFAULT_PRICING_SCHEDULE.map((tier, index) => (
                             <div key={index} className="flex items-center justify-between gap-2 text-sm">
                               <span className="text-slate-600 whitespace-nowrap w-20">{tier.min}-{tier.max} cm:</span>
                               <div className="relative flex-1">
                                <input 
                                  type="number"
                                  min="0"
                                  value={customCsPrices[index]}
                                  onChange={(e) => updateCustomCsPrice(index, Number(e.target.value))}
                                  className="w-full px-2 py-1 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none bg-white text-slate-900 text-right"
                                />
                               </div>
                               <span className="text-xs text-slate-400">pln</span>
                             </div>
                           ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {status === ProcessingStatus.PROCESSING && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-6 animate-in fade-in duration-500">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-100 rounded-full animate-ping opacity-25"></div>
              <div className="bg-white p-4 rounded-full shadow-xl relative">
                <Loader2 className="h-10 w-10 text-blue-600 animate-spin" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-xl font-semibold text-slate-900 mb-2">Analizowanie Dokumentu...</h3>
              <p className="text-slate-500">Gemini AI przetwarza tabele i oblicza koszty dla pliku: {fileName}</p>
            </div>
          </div>
        )}

        {status === ProcessingStatus.ERROR && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-6">
            <div className="bg-red-50 p-6 rounded-xl border border-red-100 text-center max-w-lg">
              <h3 className="text-red-800 font-semibold text-lg mb-2">Wystąpił błąd</h3>
              <p className="text-red-600 mb-6">{errorMsg}</p>
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-2 px-6 py-2 bg-white border border-red-200 text-red-700 font-medium rounded-lg hover:bg-red-50 transition-colors"
              >
                <RefreshCw size={18} />
                Spróbuj Ponownie
              </button>
            </div>
          </div>
        )}

        {status === ProcessingStatus.SUCCESS && result && (
          <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            
            {/* Totals Card */}
            {totals && (
              <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="bg-white/20 p-3 rounded-full">
                    <Coins size={32} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-blue-100">Całkowita Wartość Projektu</h2>
                    <p className="text-sm text-blue-200">Obliczono na podstawie {result.tables.length} tabel</p>
                  </div>
                </div>
                
                <div className="flex gap-8 text-right">
                  <div>
                    <p className="text-blue-200 text-sm font-medium uppercase tracking-wider">Suma Netto</p>
                    <p className="text-3xl font-bold">{totals.totalNetto.toFixed(2)} <span className="text-lg font-normal opacity-70">PLN</span></p>
                  </div>
                  <div className="border-l border-white/20 pl-8">
                    <p className="text-blue-200 text-sm font-medium uppercase tracking-wider">Suma Brutto</p>
                    <p className="text-3xl font-bold">{totals.totalBrutto.toFixed(2)} <span className="text-lg font-normal opacity-70">PLN</span></p>
                  </div>
                </div>
              </div>
            )}

            {/* Toolbar */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 sticky top-20 z-20 space-y-4 sm:space-y-0">
              
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="bg-green-100 text-green-700 p-2 rounded-lg">
                    <TableIcon size={20} />
                  </div>
                  <div>
                    <h3 className="font-medium text-slate-900">{fileName}</h3>
                    <p className="text-xs text-slate-500">Przetworzono tabel: {result.tables.length}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button
                    onClick={handleReset}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Trash2 size={16} />
                    Odrzuć
                  </button>
                  <button
                    onClick={handleDownload}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-md transition-all transform hover:scale-105 active:scale-95"
                  >
                    <FileDown size={18} />
                    Pobierz Wynik
                  </button>
                </div>
              </div>

              {/* Options Panel (Visible after processing too) */}
              <div className="pt-4 mt-2 border-t border-slate-100 flex flex-wrap items-start gap-x-6 gap-y-4">
                <div className="flex items-center gap-2 text-slate-600 text-sm font-medium">
                  <Settings2 size={16} />
                  <span>Opcje:</span>
                </div>
                
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                      checked={removeUoRows}
                      onChange={(e) => setRemoveUoRows(e.target.checked)}
                    />
                    <span className="text-sm text-slate-700">Pomiń drzewa do usunięcia</span>
                  </label>
                  {removeUoRows && (
                      <label className="flex items-center gap-2 cursor-pointer select-none ml-6">
                        <input 
                          type="checkbox" 
                          className="w-3 h-3 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                          checked={preserveLp}
                          onChange={(e) => setPreserveLp(e.target.checked)}
                        />
                        <span className="text-xs text-slate-600">Zachowaj oryginalne Lp.</span>
                      </label>
                  )}
                </div>
                
                 {/* Compact controls for already processed view */}
                 <div className="flex items-center gap-4 border-l pl-4 border-slate-200">
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-slate-700">Cena WE:</label>
                      <input 
                          type="number" 
                          min="0"
                          value={weBasePrice}
                          onChange={(e) => setWeBasePrice(Number(e.target.value))}
                          className="w-20 px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-sm text-slate-700">Mnożnik CS:</label>
                      <div className="relative">
                         <input 
                            type="number" 
                            step="0.1"
                            min="0"
                            disabled={!useCustomCsPricing}
                            value={csMultiplier}
                            onChange={(e) => setCsMultiplier(Number(e.target.value))}
                            className={`w-16 px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900 ${!useCustomCsPricing && 'opacity-50 bg-gray-100'}`}
                        />
                        <span className="absolute right-1 top-1 text-xs text-slate-400 pointer-events-none">x</span>
                      </div>
                       <label className="flex items-center gap-1 cursor-pointer select-none ml-1">
                        <input 
                          type="checkbox" 
                          className="w-3 h-3 text-blue-600"
                          checked={useCustomCsPricing}
                          onChange={(e) => setUseCustomCsPricing(e.target.checked)}
                        />
                        <span className="text-xs text-slate-500">Włącz</span>
                      </label>
                    </div>
                 </div>
              </div>
            </div>

            {/* Content Preview */}
            <TablePreview tables={result.tables} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6">
         <div className="max-w-5xl mx-auto px-4 text-center text-slate-400 text-sm">
           &copy; {new Date().getFullYear()} Kalkulator Drzewostanu AI. 
         </div>
      </footer>
    </div>
  );
};

export default App;