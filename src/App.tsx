import React, { useState, useCallback, useEffect } from 'react';
import { FileDown, Loader2, Table as TableIcon, RefreshCw, Trash2, Coins, Settings2 } from 'lucide-react';
import Dropzone from './components/Dropzone';
import TablePreview from './components/TablePreview';
import { extractTablesFromDocx } from './services/geminiService';
import { processTablesWithPricing, DEFAULT_PRICING_SCHEDULE } from './services/pricingCalculator';
import { ExtractionResult, ProcessingStatus, CalculatedTotals } from './types';
import { 
  Document, 
  Packer, 
  Paragraph, 
  Table, 
  TableCell, 
  TableRow, 
  WidthType, 
  TextRun, 
  AlignmentType, 
  VerticalAlign, 
  BorderStyle, 
  ShadingType, 
  PageOrientation, 
  HeadingLevel 
} from "docx";

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
  
  // WE options
  const [wePrice, setWePrice] = useState<number>(800);
  const [w2tPrice, setW2tPrice] = useState<number>(800);
  const [w4tPrice, setW4tPrice] = useState<number>(1200);

  // CS Customization Options
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
        wePrice,
        w2tPrice,
        w4tPrice,
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
    wePrice,
    w2tPrice, 
    w4tPrice, 
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

  const handleCustomCsPriceChange = (index: number, displayValue: number) => {
    const multiplier = csMultiplier > 0 ? csMultiplier : 1;
    const newBasePrice = displayValue / multiplier;
    updateCustomCsPrice(index, parseFloat(newBasePrice.toFixed(2)));
  };

  const handleDownload = async () => {
    if (!result) return;

    const titleText = result.metadata?.title || "KOSZTORYS NA WYKONANIE PRAC PIELĘGNACYJNYCH DRZEWOSTANU";
    const locationText = result.metadata?.location || "BRAK INFORMACJI";
    const detailsText = result.metadata?.administrativeDetails || "BRAK INFORMACJI";

    // Define document children
    const children: any[] = [];

    // Add Header
    children.push(
      new Paragraph({
        text: titleText,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        run: {
            bold: true,
            size: 36, // 18pt
            font: "Arial"
        }
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [new TextRun({ text: locationText, bold: true, size: 28, font: "Arial" })] // 14pt
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
        children: [new TextRun({ text: detailsText, size: 24, font: "Arial" })] // 12pt
      })
    );

    // Helper to create a Paragraph with line breaks for newlines in text
    const createCellContent = (text: string, isHeader: boolean = false) => {
        const lines = text.split('\n');
        return new Paragraph({
            alignment: AlignmentType.CENTER, // Center all content
            children: lines.map((line, i) => new TextRun({
                text: line,
                bold: isHeader,
                size: 20, // 10pt (docx uses half-points)
                font: "Arial",
                break: i > 0 ? 1 : 0 // Add break for lines after the first
            }))
        });
    };

    // DXA Calculations for A4 Landscape
    // Width: 29.7cm. Margins: ~1.27cm each side. Usable: ~27.16cm.
    // 1cm = ~567 DXA. 27.16cm = ~15400 DXA.
    const TOTAL_PAGE_WIDTH_DXA = 15400;

    const getColumnWidths = (colCount: number): number[] => {
        // Standard layout for 6 columns (Lp, Name, Circ, Treat, Netto, Brutto)
        if (colCount === 6) {
            return [
                770,   // ~5%  - Lp
                5390,  // ~35% - Name
                2310,  // ~15% - Circ
                2310,  // ~15% - Treat
                2310,  // ~15% - Netto
                2310   // ~15% - Brutto
            ];
        }
        // Fallback: distribute evenly
        return Array(colCount).fill(Math.floor(TOTAL_PAGE_WIDTH_DXA / colCount));
    };

    // Add Tables
    result.tables.forEach((table) => {
        // Table Title if exists
        if (table.title) {
            children.push(new Paragraph({
                text: table.title,
                heading: HeadingLevel.HEADING_3,
                spacing: { before: 200, after: 100 },
                run: { size: 24, bold: true, font: "Arial" }
            }));
        }

        const tableRows: TableRow[] = [];

        // Header Row
        if (table.headers && table.headers.length > 0) {
            tableRows.push(new TableRow({
                tableHeader: false, // Do not repeat header on new page
                cantSplit: true,
                children: table.headers.map(h => new TableCell({
                    shading: { fill: "BFBFBF", val: ShadingType.CLEAR, color: "auto" }, // Gray background
                    verticalAlign: VerticalAlign.CENTER,
                    margins: { top: 100, bottom: 100, left: 100, right: 100 }, // Compact margins
                    children: [createCellContent(h, true)]
                }))
            }));
        }

        // Data Rows
        table.rows.forEach(row => {
            tableRows.push(new TableRow({
                cantSplit: true, // Try to keep row content together on one page
                children: row.map(cell => new TableCell({
                    verticalAlign: VerticalAlign.CENTER,
                    margins: { top: 100, bottom: 100, left: 100, right: 100 },
                    children: [createCellContent(cell, false)]
                }))
            }));
        });

        // SKIP if no rows (prevents Invalid array length error)
        if (tableRows.length === 0) return;

        // Determine column widths based on actual column count
        const colCount = table.headers?.length || table.rows[0]?.length || 0;
        const colWidths = getColumnWidths(colCount);

        const docxTable = new Table({
            rows: tableRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnWidths: colWidths, // Forces the grid layout
            borders: {
                top: { style: BorderStyle.SINGLE, size: 1 },
                bottom: { style: BorderStyle.SINGLE, size: 1 },
                left: { style: BorderStyle.SINGLE, size: 1 },
                right: { style: BorderStyle.SINGLE, size: 1 },
                insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
                insideVertical: { style: BorderStyle.SINGLE, size: 1 },
            }
        });

        children.push(docxTable);
        children.push(new Paragraph({ text: "", spacing: { after: 200 } })); // Spacer
    });

    // Add Summary Table at the end
    if (totals) {
        // Summary table widths (60% / 20% / 20%) mapped to DXA
        const summaryWidths = [9240, 3080, 3080];

        const summaryRow = new TableRow({
            children: [
                new TableCell({
                    children: [new Paragraph({ 
                        alignment: AlignmentType.RIGHT,
                        children: [new TextRun({ text: "RAZEM CAŁOŚĆ:", bold: true, size: 20, font: "Arial" })]
                    })],
                    shading: { fill: "E9ECEF", val: ShadingType.CLEAR, color: "auto" },
                    margins: { right: 200 },
                }),
                new TableCell({
                    children: [new Paragraph({ 
                         alignment: AlignmentType.CENTER,
                         children: [new TextRun({ text: `Netto: ${totals.totalNetto.toFixed(2)} PLN`, size: 20, font: "Arial" })]
                    })],
                     shading: { fill: "E9ECEF", val: ShadingType.CLEAR, color: "auto" },
                }),
                new TableCell({
                    children: [new Paragraph({ 
                         alignment: AlignmentType.CENTER,
                         children: [new TextRun({ text: `Brutto: ${totals.totalBrutto.toFixed(2)} PLN`, size: 20, font: "Arial" })]
                    })],
                    shading: { fill: "E9ECEF", val: ShadingType.CLEAR, color: "auto" },
                })
            ]
        });

        children.push(new Table({
            rows: [summaryRow],
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnWidths: summaryWidths,
            borders: {
                top: { style: BorderStyle.SINGLE, size: 1 },
                bottom: { style: BorderStyle.SINGLE, size: 1 },
                left: { style: BorderStyle.SINGLE, size: 1 },
                right: { style: BorderStyle.SINGLE, size: 1 },
                insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
                insideVertical: { style: BorderStyle.SINGLE, size: 1 },
            }
        }));
    }

    // Create Document
    const doc = new Document({
        sections: [{
            properties: {
                page: {
                    size: {
                        orientation: PageOrientation.LANDSCAPE
                    },
                    margin: {
                        top: 720, // 0.5 inch approx (Narrow)
                        bottom: 720,
                        left: 720,
                        right: 720
                    }
                }
            },
            children: children
        }]
    });

    // Pack and Download
    try {
        const blob = await Packer.toBlob(doc);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kalkulacja_${fileName.replace(/\.docx$/i, '')}.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Error generating DOCX:", error);
        alert("Błąd podczas generowania pliku DOCX.");
    }
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
                            className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500"
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
                    
                    <div className="grid grid-cols-3 gap-4">
                      {/* WE Price */}
                      <div className="flex flex-col">
                        <label className="text-sm font-medium text-slate-600 mb-1">
                          Cena WE
                        </label>
                        <div className="relative">
                          <input 
                            type="number" 
                            min="0"
                            value={wePrice}
                            onChange={(e) => setWePrice(Number(e.target.value))}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white text-slate-900"
                          />
                          <span className="absolute right-3 top-2 text-slate-400 text-sm">PLN</span>
                        </div>
                      </div>

                      {/* W2t Price */}
                      <div className="flex flex-col">
                        <label className="text-sm font-medium text-slate-600 mb-1">
                          Cena W2t
                        </label>
                        <div className="relative">
                          <input 
                            type="number" 
                            min="0"
                            value={w2tPrice}
                            onChange={(e) => setW2tPrice(Number(e.target.value))}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white text-slate-900"
                          />
                          <span className="absolute right-3 top-2 text-slate-400 text-sm">PLN</span>
                        </div>
                      </div>

                      {/* W4t Price */}
                      <div className="flex flex-col">
                        <label className="text-sm font-medium text-slate-600 mb-1">
                          Cena W4t
                        </label>
                        <div className="relative">
                          <input 
                            type="number" 
                            min="0"
                            value={w4tPrice}
                            onChange={(e) => setW4tPrice(Number(e.target.value))}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white text-slate-900"
                          />
                          <span className="absolute right-3 top-2 text-slate-400 text-sm">PLN</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 3. CS Pricing Options */}
                  <div className="flex flex-col p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                        <Settings2 size={16} className="text-blue-500"/> Cennik CS, CR, CP
                      </h3>
                    </div>

                    <div className="space-y-4">
                      
                      {/* Global Multiplier */}
                      <div className="flex flex-col pb-3 border-b border-slate-100">
                        <label className="text-sm font-medium text-slate-600 mb-1">
                           Mnożnik dla cen CS, CR, CP
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
                         <p className="text-xs font-semibold text-slate-500 uppercase mb-2 sticky top-0 bg-white py-1">Ceny po mnożniku</p>
                         {DEFAULT_PRICING_SCHEDULE.map((tier, index) => (
                           <div key={index} className="flex items-center justify-between gap-2 text-sm">
                             <span className="text-slate-600 whitespace-nowrap w-20">{tier.min}-{tier.max} cm:</span>
                             <div className="relative flex-1">
                              <input 
                                type="number"
                                min="0"
                                step="1"
                                value={Math.ceil(customCsPrices[index] * csMultiplier)}
                                onChange={(e) => handleCustomCsPriceChange(index, Number(e.target.value))}
                                className="w-full px-2 py-1 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none bg-white text-slate-900 text-right"
                              />
                             </div>
                             <span className="text-xs text-slate-400">pln</span>
                           </div>
                         ))}
                      </div>
                    </div>
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
                      className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500"
                      checked={removeUoRows}
                      onChange={(e) => setRemoveUoRows(e.target.checked)}
                    />
                    <span className="text-sm text-slate-700">Pomiń drzewa do usunięcia</span>
                  </label>
                  {removeUoRows && (
                      <label className="flex items-center gap-2 cursor-pointer select-none ml-6">
                        <input 
                          type="checkbox" 
                          className="w-3 h-3 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500"
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
                          value={wePrice}
                          onChange={(e) => setWePrice(Number(e.target.value))}
                          className="w-20 px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-slate-700">Cena W2t:</label>
                      <input 
                          type="number" 
                          min="0"
                          value={w2tPrice}
                          onChange={(e) => setW2tPrice(Number(e.target.value))}
                          className="w-20 px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
                      />
                    </div>
                     <div className="flex items-center gap-2">
                      <label className="text-sm text-slate-700">Cena W4t:</label>
                      <input 
                          type="number" 
                          min="0"
                          value={w4tPrice}
                          onChange={(e) => setW4tPrice(Number(e.target.value))}
                          className="w-20 px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-sm text-slate-700">Mnożnik CS/CR/CP:</label>
                      <div className="relative">
                         <input 
                            type="number" 
                            step="0.1"
                            min="0"
                            value={csMultiplier}
                            onChange={(e) => setCsMultiplier(Number(e.target.value))}
                            className="w-16 px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
                        />
                        <span className="absolute right-1 top-1 text-xs text-slate-400 pointer-events-none">x</span>
                      </div>
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