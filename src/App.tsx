import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FileDown, Loader2, Table as TableIcon, RefreshCw, Trash2, Settings2, TreeDeciduous, Leaf, Check, Calculator, ChevronDown, ChevronUp } from 'lucide-react';
import Dropzone from '../components/Dropzone';
import TablePreview from '../components/TablePreview';
import { extractTablesFromDocx } from '../services/geminiService';
import { processTablesWithPricing, DEFAULT_PRICING_SCHEDULE } from '../services/pricingCalculator';
import { ExtractionResult, ProcessingStatus, CalculatedTotals, ExtractedTable } from '../types';
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
} from "docx";
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- UTILS ---

const formatNumberWithSpaces = (num: number): string => {
    if (num === null || num === undefined) return "0";
    const fixed = num.toFixed(2);
    // Remove .00 if present
    const clean = fixed.endsWith('.00') ? fixed.slice(0, -3) : fixed;
    const parts = clean.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return parts.join('.');
};

const slugify = (text: string): string => {
  if (!text) return 'document';
  const a = 'àáâäæãåāăąçćčđďèéêëēėęěğǵḧîïíīįìłḿñńǹňôöòóœøōõőṕŕřßśšşșťțûüùúūǘůűųẃẍÿýžźż·/_,:;';
  const b = 'aaaaaaaaaacccddeeeeeeeegghiiiiiilmnnnnoooooooooprrsssssttuuuuuuuuuwxyyzzz------';
  const p = new RegExp(a.split('').join('|'), 'g');
  return text.toString().toLowerCase()
    .replace(/\s+/g, '-') 
    .replace(p, c => b.charAt(a.indexOf(c))) 
    .replace(/&/g, '-and-') 
    .replace(/[^\w\-]+/g, '') 
    .replace(/\-\-+/g, '-') 
    .replace(/^-+/, '') 
    .replace(/-+$/, '');
};

const cleanDuplicateText = (text: string): string => {
  if (!text) return "";
  let cleanText = text.trim();

  // 1. Check for exact full repetition (e.g. "ABC ABC")
  const words = cleanText.split(/\s+/);
  if (words.length > 1 && words.length % 2 === 0) {
    const mid = words.length / 2;
    const firstHalf = words.slice(0, mid).join(" ");
    const secondHalf = words.slice(mid).join(" ");
    if (firstHalf.toLowerCase() === secondHalf.toLowerCase()) {
      return firstHalf;
    }
  }

  // 2. Check for suffix repetition (e.g. "Title Info Some Address some address")
  // We iterate backwards trying to find a suffix that matches the preceding text
  const lowerText = cleanText.toLowerCase();
  for (let i = Math.floor(cleanText.length / 2); i < cleanText.length; i++) {
     const suffix = lowerText.substring(i).trim();
     if (suffix.length < 5) continue; // Too short to matter
     
     const preceding = lowerText.substring(0, i).trim();
     if (preceding.endsWith(suffix)) {
         // Found a repeat!
         // Return the text up to the start of the suffix match in the original string
         // We need to be careful with indices since we trimmed
         // Simple heuristic: cut the string at i
         return cleanText.substring(0, i).trim();
     }
  }

  // 3. Remove standard adjacent duplicates
  const uniqueAdjacent: string[] = [];
  for (const word of words) {
    const current = word.replace(/[.,;:]$/, '');
    const prev = uniqueAdjacent.length > 0 ? uniqueAdjacent[uniqueAdjacent.length - 1].replace(/[.,;:]$/, '') : null;
    if (!prev || current.toLowerCase() !== prev.toLowerCase()) {
      uniqueAdjacent.push(word);
    }
  }
  
  return uniqueAdjacent.join(" ");
};

const isLocationRedundant = (title: string, location: string): boolean => {
    if (!location || location.length < 3) return false;
    
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9ąęćłńóśźż\s]/g, '').trim();
    
    const tNorm = normalize(title);
    const lNorm = normalize(location);
    
    // Direct inclusion check
    if (tNorm.includes(lNorm)) return true;

    // Token overlap check
    const lTokens = lNorm.split(/\s+/).filter(w => w.length > 2); // Filter out short words
    if (lTokens.length === 0) return false;

    let matchCount = 0;
    for (const token of lTokens) {
        if (tNorm.includes(token)) {
            matchCount++;
        }
    }

    // If more than 60% of significant location words are in the title, it's redundant
    const overlap = matchCount / lTokens.length;
    return overlap > 0.6;
};

// --- CUSTOM COMPONENTS ---

// Custom Toggle Switch
const Toggle = ({ label, checked, onChange, subLabel = "", children }: { label: string, checked: boolean, onChange: (val: boolean) => void, subLabel?: string, children?: React.ReactNode }) => (
  <div className="flex flex-col">
    <div 
      className={`flex items-start gap-4 p-4 rounded-xl border transition-all cursor-pointer select-none group ${checked ? 'bg-emerald-50/50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800' : 'bg-white border-stone-200 dark:bg-stone-800 dark:border-stone-700'}`}
      onClick={() => onChange(!checked)}
    >
      <div className={`relative w-12 h-7 rounded-full transition-colors duration-300 shrink-0 mt-0.5 ${checked ? 'bg-emerald-600' : 'bg-stone-300 dark:bg-stone-600'}`}>
        <div className={`absolute top-1 left-1 bg-white w-5 h-5 rounded-full shadow-sm transition-transform duration-300 ${checked ? 'translate-x-5' : 'translate-x-0'}`}></div>
      </div>
      <div className="flex-1">
        <span className={`font-medium transition-colors ${checked ? 'text-emerald-900 dark:text-emerald-200' : 'text-stone-700 dark:text-stone-300'}`}>
          {label}
        </span>
        {subLabel && <p className="text-xs text-stone-500 mt-1 dark:text-stone-400">{subLabel}</p>}
      </div>
    </div>
    {/* Render children (like sub-checkboxes) if checked */}
    {checked && children && (
      <div className="ml-8 pl-8 border-l-2 border-stone-200 dark:border-stone-700 mt-2 animate-in slide-in-from-top-2 fade-in">
        {children}
      </div>
    )}
  </div>
);

// Styled Input
const NumberInput = ({ label, value, onChange, unit }: { label: string, value: number, onChange: (val: number) => void, unit?: string }) => (
  <div className="flex flex-col">
    <label className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5 dark:text-stone-400">{label}</label>
    <div className="relative group">
      <input 
        type="number" 
        min="0"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full pl-3 pr-8 py-2 bg-stone-50 border border-stone-200 rounded-lg text-stone-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all dark:bg-stone-800 dark:border-stone-700 dark:text-stone-200"
      />
      {unit && <span className="absolute right-3 top-2 text-stone-400 text-sm font-medium">{unit}</span>}
    </div>
  </div>
);

// --- MAIN APP ---

const App: React.FC = () => {
  const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  const [rawResult, setRawResult] = useState<ExtractionResult | null>(null);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [totals, setTotals] = useState<CalculatedTotals | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Settings State
  const [removeUoRows, setRemoveUoRows] = useState<boolean>(true);
  const [removeZeroPriceRows, setRemoveZeroPriceRows] = useState<boolean>(true);
  const [preserveLp, setPreserveLp] = useState<boolean>(true); 
  
  const [wePrice, setWePrice] = useState<number>(800);
  const [w2tPrice, setW2tPrice] = useState<number>(800);
  const [w4tPrice, setW4tPrice] = useState<number>(1200);
  const [kuPrice, setKuPrice] = useState<number>(500);

  const [csMultiplier, setCsMultiplier] = useState<number>(1.0);
  const [customCsPrices, setCustomCsPrices] = useState<number[]>(DEFAULT_PRICING_SCHEDULE.map(t => t.price));
  const [areSettingsOpen, setAreSettingsOpen] = useState(true);

  // UI State
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const downloadMenuRef = useRef<HTMLDivElement>(null);

  // --- HANDLERS ---

  const handleFileSelected = useCallback(async (file: File) => {
    setStatus(ProcessingStatus.PROCESSING);
    setErrorMsg(null);
    setFileName(file.name);
    setTotals(null);
    setRawResult(null);
    setResult(null);
    
    try {
      const extractionResult = await extractTablesFromDocx(file);
      setRawResult(extractionResult);
    } catch (error) {
      console.error(error);
      setErrorMsg("Nie udało się przetworzyć dokumentu. Sprawdź, czy plik nie jest uszkodzony.");
      setStatus(ProcessingStatus.ERROR);
    }
  }, []);

  const recalculateTotals = (tables: ExtractedTable[]) => {
      let net = 0;
      let gross = 0;
      tables.forEach(table => {
          // Identify columns by header text
          const netIndex = table.headers.findIndex(h => h.toLowerCase().includes('[netto]'));
          const grossIndex = table.headers.findIndex(h => h.toLowerCase().includes('[brutto]'));
          
          if (netIndex !== -1) {
              table.rows.forEach(row => {
                  const valStr = row[netIndex];
                  if (valStr) {
                    const val = parseFloat(valStr.replace(/\s/g, '').replace(',', '.'));
                    if (!isNaN(val)) net += val;
                  }
              });
          }
          
          if (grossIndex !== -1) {
              table.rows.forEach(row => {
                  const valStr = row[grossIndex];
                  if (valStr) {
                    const val = parseFloat(valStr.replace(/\s/g, '').replace(',', '.'));
                    if (!isNaN(val)) gross += val;
                  }
              });
          }
      });
      setTotals({ totalNetto: net, totalBrutto: gross });
  };

  const handleDeleteRow = (tableIndex: number, rowIndex: number) => {
      if (!result) return;
      const newTables = [...result.tables];
      const table = { ...newTables[tableIndex] };
      const newRows = [...table.rows];
      newRows.splice(rowIndex, 1);
      table.rows = newRows;
      newTables[tableIndex] = table;
      
      const newResult = { ...result, tables: newTables };
      setResult(newResult);
      recalculateTotals(newTables);
  };

  const handleDeleteColumn = (tableIndex: number, colIndex: number) => {
      if (!result) return;
      const newTables = [...result.tables];
      const table = { ...newTables[tableIndex] };
      
      // Update Header
      const newHeaders = [...table.headers];
      newHeaders.splice(colIndex, 1);
      table.headers = newHeaders;
      
      // Update Rows
      const newRows = table.rows.map(row => {
          const r = [...row];
          r.splice(colIndex, 1);
          return r;
      });
      table.rows = newRows;
      
      newTables[tableIndex] = table;
      const newResult = { ...result, tables: newTables };
      setResult(newResult);
      recalculateTotals(newTables);
  };

  useEffect(() => {
    if (rawResult) {
      const { processedTables, totals: calculatedTotals } = processTablesWithPricing(rawResult.tables, {
        removeUoRows,
        removeZeroPriceRows,
        preserveLp,
        wePrice,
        w2tPrice,
        w4tPrice,
        kuPrice,
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
  }, [rawResult, removeUoRows, removeZeroPriceRows, preserveLp, wePrice, w2tPrice, w4tPrice, kuPrice, csMultiplier, customCsPrices]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(event.target as Node)) {
        setIsDownloadMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleReset = () => {
    setStatus(ProcessingStatus.IDLE);
    setResult(null);
    setRawResult(null);
    setTotals(null);
    setFileName("");
    setErrorMsg(null);
  };

  const handleCustomCsPriceChange = (index: number, displayValue: number) => {
    const multiplier = csMultiplier > 0 ? csMultiplier : 1;
    const newBasePrice = displayValue / multiplier;
    const newPrices = [...customCsPrices];
    newPrices[index] = parseFloat(newBasePrice.toFixed(2));
    setCustomCsPrices(newPrices);
  };

  // --- DOWNLOAD HANDLERS ---

  const prepareMetadataForDownload = () => {
      if (!result) return null;
      let titleText = result.metadata?.title || "KOSZTORYS NA WYKONANIE PRAC PIELĘGNACYJNYCH DRZEWOSTANU";
      
      // Standardize title
      if (titleText.match(/^PROGRAM PRAC/i) || titleText.match(/^INWENTARYZACJA/i)) {
          titleText = "KOSZTORYS NA WYKONANIE PRAC PIELĘGNACYJNYCH DRZEWOSTANU " + titleText.replace(/^(PROGRAM PRAC PIELĘGNACYJNYCH|INWENTARYZACJA I PROGRAM|INWENTARYZACJA)/i, "").trim();
      }
      titleText = cleanDuplicateText(titleText);
      
      let locationText = result.metadata?.location || "";
      locationText = cleanDuplicateText(locationText);
      
      if (isLocationRedundant(titleText, locationText)) {
          locationText = "";
      }
      
      return { 
          titleText, 
          locationText, 
          detailsText: result.metadata?.administrativeDetails || "" 
      };
  };

  const handleDownloadDocx = async () => {
    if (!result) return;
    const meta = prepareMetadataForDownload();
    if (!meta) return;

    // Define document children
    const children: any[] = [];
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: meta.titleText, font: "Arial", size: 32, color: "000000", bold: true })]
      })
    );
    if (meta.locationText) {
        children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: meta.locationText, bold: true, size: 32, font: "Arial" })] }));
    }
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new TextRun({ text: meta.detailsText, size: 24, font: "Arial" })] }));

    const createCellContent = (text: string, isHeader: boolean = false) => {
        const lines = text.split('\n');
        return new Paragraph({
            alignment: AlignmentType.CENTER,
            children: lines.map((line, i) => new TextRun({ text: line, bold: isHeader, size: 20, font: "Arial", break: i > 0 ? 1 : 0 }))
        });
    };
    const TOTAL_PAGE_WIDTH_DXA = 15400;
    const getColumnWidths = (colCount: number): number[] => {
      if (colCount <= 0) return [];
      if (colCount === 6) {
          const percentages = [0.05, 0.35, 0.15, 0.15, 0.15, 0.15]; 
          const widths = percentages.map(p => Math.floor(TOTAL_PAGE_WIDTH_DXA * p));
          widths.push(TOTAL_PAGE_WIDTH_DXA - widths.reduce((acc, val) => acc + val, 0)); 
          return widths;
      }
      const equalWidth = Math.floor(TOTAL_PAGE_WIDTH_DXA / colCount);
      const widths = Array(colCount - 1).fill(equalWidth);
      widths.push(TOTAL_PAGE_WIDTH_DXA - widths.reduce((acc, val) => acc + val, 0));
      return widths;
    };

    result.tables.forEach((table) => {
        const tableRows: TableRow[] = [];
        if (table.headers && table.headers.length > 0) {
            tableRows.push(new TableRow({ cantSplit: true, children: table.headers.map(h => new TableCell({ shading: { fill: "BFBFBF", val: ShadingType.CLEAR, color: "auto" }, verticalAlign: VerticalAlign.CENTER, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [createCellContent(h, true)] })) }));
        }
        table.rows.forEach(row => {
            tableRows.push(new TableRow({ cantSplit: true, children: row.map(cell => new TableCell({ verticalAlign: VerticalAlign.CENTER, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [createCellContent(cell, false)] })) }));
        });
        if (tableRows.length === 0) return;
        children.push(new Table({ rows: tableRows, width: { size: TOTAL_PAGE_WIDTH_DXA, type: WidthType.DXA }, columnWidths: getColumnWidths(table.headers?.length || table.rows[0]?.length || 0), borders: { top: { style: BorderStyle.SINGLE, size: 1 }, bottom: { style: BorderStyle.SINGLE, size: 1 }, left: { style: BorderStyle.SINGLE, size: 1 }, right: { style: BorderStyle.SINGLE, size: 1 }, insideHorizontal: { style: BorderStyle.SINGLE, size: 1 }, insideVertical: { style: BorderStyle.SINGLE, size: 1 } } }));
        children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
    });

    if (totals) {
        const summaryWidthsCalc = [Math.floor(TOTAL_PAGE_WIDTH_DXA * 0.6), Math.floor(TOTAL_PAGE_WIDTH_DXA * 0.2)];
        summaryWidthsCalc.push(TOTAL_PAGE_WIDTH_DXA - summaryWidthsCalc.reduce((a, b) => a + b, 0));
        children.push(new Table({
            rows: [new TableRow({ children: [
                new TableCell({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "RAZEM CAŁOŚĆ:", bold: true, size: 20, font: "Arial" })] })], shading: { fill: "E9ECEF", val: ShadingType.CLEAR, color: "auto" }, margins: { right: 200 } }),
                new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `Netto: ${formatNumberWithSpaces(totals.totalNetto)} PLN`, size: 20, font: "Arial" })] })], shading: { fill: "E9ECEF", val: ShadingType.CLEAR, color: "auto" } }),
                new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `Brutto: ${formatNumberWithSpaces(totals.totalBrutto)} PLN`, size: 20, font: "Arial" })] })], shading: { fill: "E9ECEF", val: ShadingType.CLEAR, color: "auto" } })
            ] })],
            width: { size: TOTAL_PAGE_WIDTH_DXA, type: WidthType.DXA },
            columnWidths: summaryWidthsCalc,
            borders: { top: { style: BorderStyle.SINGLE, size: 1 }, bottom: { style: BorderStyle.SINGLE, size: 1 }, left: { style: BorderStyle.SINGLE, size: 1 }, right: { style: BorderStyle.SINGLE, size: 1 }, insideHorizontal: { style: BorderStyle.SINGLE, size: 1 }, insideVertical: { style: BorderStyle.SINGLE, size: 1 } }
        }));
    }

    const doc = new Document({ compatibility: { version: 17 }, sections: [{ properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } }, children: children }] });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    const townName = result.metadata?.townName;
    const locationForFile = (townName && townName.trim()) ? townName : result.metadata?.location || "Dokument";
    a.download = `Kosztorys_${slugify(locationForFile)}.docx`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = async () => {
    if (!result) return;
    const meta = prepareMetadataForDownload();
    if (!meta) return;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    try {
        const fontBaseUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/";
        const loadFont = async (filename: string, fontName: string, style: string) => {
            const response = await fetch(`${fontBaseUrl}${filename}`);
            if (!response.ok) throw new Error();
            const buffer = await response.arrayBuffer();
            let binary = "";
            const bytes = new Uint8Array(buffer);
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
            doc.addFileToVFS(filename, binary);
            doc.addFont(filename, fontName, style);
        };
        await Promise.all([loadFont("Roboto-Regular.ttf", "Roboto", "normal"), loadFont("Roboto-Medium.ttf", "Roboto", "bold")]);
        doc.setFont("Roboto", "bold");
    } catch (e) { doc.setFont("helvetica", "bold"); }

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;
    const availableWidth = pageWidth - (margin * 2);
    let currentY = 40;

    doc.setFontSize(16);
    const splitTitle = doc.splitTextToSize(meta.titleText, availableWidth);
    doc.text(splitTitle, pageWidth / 2, currentY, { align: 'center' });
    currentY += (splitTitle.length * 20);

    if (meta.locationText) {
        const splitLocation = doc.splitTextToSize(meta.locationText, availableWidth);
        doc.text(splitLocation, pageWidth / 2, currentY, { align: 'center' });
        currentY += (splitLocation.length * 20);
    }
    
    try { doc.setFont("Roboto", "normal"); } catch(e) { doc.setFont("helvetica", "normal"); }
    doc.setFontSize(12);
    const splitDetails = doc.splitTextToSize(meta.detailsText, availableWidth);
    doc.text(splitDetails, pageWidth / 2, currentY, { align: 'center' });
    currentY += (splitDetails.length * 15) + 20;

    const fontName = doc.getFontList().hasOwnProperty("Roboto") ? "Roboto" : "helvetica";
    const tableFontStyles = { font: fontName, fontStyle: 'normal' as const, overflow: 'linebreak' as const };
    const getPdfColumnWidths = (colCount: number): number[] | undefined => {
        if (colCount === 6) return [0.05, 0.35, 0.15, 0.15, 0.15, 0.15].map(p => availableWidth * p);
        return Array(colCount).fill(availableWidth / colCount);
    };

    result.tables.forEach((table) => {
        if (!table.rows || table.rows.length === 0) return;
        const colWidths = getPdfColumnWidths(table.headers?.length || table.rows[0]?.length || 0);
        const columnStyles: { [key: number]: { cellWidth: number } } = {};
        if (colWidths) colWidths.forEach((w, i) => columnStyles[i] = { cellWidth: w });

        autoTable(doc, {
            head: table.headers ? [table.headers] : [],
            body: table.rows,
            startY: currentY,
            theme: 'grid',
            headStyles: { fillColor: [191, 191, 191], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center', valign: 'middle', font: fontName, lineWidth: 0.1, lineColor: [0, 0, 0] },
            bodyStyles: { halign: 'center', valign: 'middle', lineWidth: 0.1, lineColor: [0, 0, 0], ...tableFontStyles },
            alternateRowStyles: { fillColor: [255, 255, 255] },
            margin: { left: margin, right: margin },
            columnStyles: columnStyles,
            pageBreak: 'auto',
            showHead: 'everyPage'
        });
        // @ts-ignore
        const finalY = doc.lastAutoTable.finalY;
        currentY = finalY ? finalY + 20 : currentY; 
    });

    if (totals) {
        const summaryWidths = [availableWidth * 0.6, availableWidth * 0.2, availableWidth * 0.2];
        const summaryColumnStyles: { [key: number]: { cellWidth: number } } = {};
        summaryWidths.forEach((w, i) => summaryColumnStyles[i] = { cellWidth: w });
        autoTable(doc, {
            body: [[ { content: 'RAZEM CAŁOŚĆ:', styles: { halign: 'right', fontStyle: 'bold', ...tableFontStyles } }, { content: `Netto: ${formatNumberWithSpaces(totals.totalNetto)} PLN`, styles: { halign: 'center', ...tableFontStyles } }, { content: `Brutto: ${formatNumberWithSpaces(totals.totalBrutto)} PLN`, styles: { halign: 'center', ...tableFontStyles } } ]],
            startY: currentY,
            theme: 'grid',
            bodyStyles: { fillColor: [233, 236, 239], textColor: [0, 0, 0], valign: 'middle', lineWidth: 0.1, lineColor: [0, 0, 0] },
            margin: { left: margin, right: margin },
            columnStyles: summaryColumnStyles
        });
    }

    const townName = result.metadata?.townName;
    const locationForFile = (townName && townName.trim()) ? townName : result.metadata?.location || "Dokument";
    doc.save(`Kosztorys_${slugify(locationForFile)}.pdf`);
  };

  // --- RENDER ---

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-900 flex flex-col font-sans text-stone-900">
      
      {/* 1. HERO HEADER */}
      <header className="bg-emerald-950 text-white shadow-xl z-20 sticky top-0">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-800/50 p-2 rounded-lg border border-emerald-700">
                <TreeDeciduous className="h-6 w-6 text-emerald-300" />
            </div>
            <div>
                <h1 className="text-xl font-serif font-semibold tracking-wide text-emerald-50">Kalkulator Drzewostanu</h1>
                <p className="text-xs text-emerald-400 font-medium tracking-wider uppercase">Professional Estimator v2.0</p>
            </div>
          </div>
          
          {/* Stats Summary (Visible when processed) */}
          {status === ProcessingStatus.SUCCESS && totals && (
             <div className="hidden md:flex items-center gap-6 bg-emerald-900/50 px-6 py-2 rounded-full border border-emerald-800/50">
                <div className="flex flex-col items-end">
                    <span className="text-[10px] text-emerald-400 uppercase tracking-widest font-bold">Netto</span>
                    <span className="text-lg font-bold font-serif leading-none">{formatNumberWithSpaces(totals.totalNetto)} zł</span>
                </div>
                <div className="h-8 w-px bg-emerald-700"></div>
                <div className="flex flex-col items-end">
                    <span className="text-[10px] text-emerald-400 uppercase tracking-widest font-bold">Brutto</span>
                    <span className="text-lg font-bold font-serif leading-none text-white">{formatNumberWithSpaces(totals.totalBrutto)} zł</span>
                </div>
             </div>
          )}
        </div>
      </header>

      {/* 2. MAIN CONTENT AREA */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8">
        
        {/* VIEW: IDLE */}
        {status === ProcessingStatus.IDLE && (
          <div className="flex flex-col items-center justify-center min-h-[70vh] animate-in fade-in zoom-in duration-500">
            <div className="text-center max-w-2xl mb-10 space-y-4">
              <h2 className="text-4xl md:text-5xl font-serif font-medium text-stone-800 dark:text-stone-100">
                Wycena Pielęgnacji <br/> <span className="text-emerald-700 italic dark:text-emerald-400">Drzewostanu</span>
              </h2>
              <p className="text-lg text-stone-500 dark:text-stone-400 font-light">
                Zaawansowane narzędzie AI do ekstrakcji tabel inwentaryzacyjnych i automatycznego kosztorysowania.
              </p>
            </div>
            
            <div className="w-full max-w-3xl">
              <Dropzone onFileSelected={handleFileSelected} />
              
              <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
                 <div className="p-4 bg-white rounded-xl shadow-sm border border-stone-100 dark:bg-stone-800 dark:border-stone-700">
                    <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3 dark:bg-blue-900/30 dark:text-blue-400">
                        <TableIcon size={20} />
                    </div>
                    <h3 className="font-semibold text-stone-700 dark:text-stone-200">Ekstrakcja Tabel</h3>
                    <p className="text-xs text-stone-500 mt-1 dark:text-stone-400">Import z Worda zachowujący strukturę.</p>
                 </div>
                 <div className="p-4 bg-white rounded-xl shadow-sm border border-stone-100 dark:bg-stone-800 dark:border-stone-700">
                    <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3 dark:bg-emerald-900/30 dark:text-emerald-400">
                        <Calculator size={20} />
                    </div>
                    <h3 className="font-semibold text-stone-700 dark:text-stone-200">Inteligentna Wycena</h3>
                    <p className="text-xs text-stone-500 mt-1 dark:text-stone-400">Algorytmy rozpoznające typy zabiegów.</p>
                 </div>
                 <div className="p-4 bg-white rounded-xl shadow-sm border border-stone-100 dark:bg-stone-800 dark:border-stone-700">
                    <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-3 dark:bg-amber-900/30 dark:text-amber-400">
                        <FileDown size={20} />
                    </div>
                    <h3 className="font-semibold text-stone-700 dark:text-stone-200">Eksport Raportów</h3>
                    <p className="text-xs text-stone-500 mt-1 dark:text-stone-400">Gotowe pliki DOCX i PDF.</p>
                 </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW: PROCESSING */}
        {status === ProcessingStatus.PROCESSING && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-in fade-in duration-700">
            <div className="relative">
              <div className="absolute inset-0 bg-emerald-100 rounded-full animate-ping opacity-40 dark:bg-emerald-900/30"></div>
              <div className="bg-white p-6 rounded-full shadow-2xl relative border border-emerald-50 dark:bg-stone-800 dark:border-stone-700">
                <Loader2 className="h-12 w-12 text-emerald-600 animate-spin" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-serif text-stone-800 dark:text-stone-100">Przetwarzanie danych</h3>
              <p className="text-stone-500 font-light dark:text-stone-400">Analiza struktury dokumentu i identyfikacja cennika...</p>
            </div>
          </div>
        )}

        {/* VIEW: ERROR */}
        {status === ProcessingStatus.ERROR && (
          <div className="flex flex-col items-center justify-center min-h-[50vh]">
            <div className="bg-red-50 p-8 rounded-2xl border border-red-100 text-center max-w-lg shadow-sm dark:bg-red-950/20 dark:border-red-900/50">
              <h3 className="text-red-900 font-serif text-xl mb-3 dark:text-red-300">Wystąpił błąd</h3>
              <p className="text-red-700 mb-8 text-sm dark:text-red-400">{errorMsg}</p>
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-white border border-red-200 text-red-700 font-semibold rounded-lg hover:bg-red-50 transition-colors shadow-sm dark:bg-stone-800 dark:border-stone-700 dark:text-red-400 dark:hover:bg-stone-700"
              >
                <RefreshCw size={18} />
                Spróbuj Ponownie
              </button>
            </div>
          </div>
        )}

        {/* VIEW: SUCCESS / DASHBOARD */}
        {status === ProcessingStatus.SUCCESS && result && (
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            
            {/* 1. CONTROL DECK */}
            <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden dark:bg-stone-800 dark:border-stone-700">
                {/* Deck Header */}
                <div className="bg-stone-50 px-6 py-4 border-b border-stone-200 flex items-center justify-between dark:bg-stone-900 dark:border-stone-700">
                    <div className="flex items-center gap-3">
                         <div className="bg-emerald-100 text-emerald-700 p-1.5 rounded-md dark:bg-emerald-900/50 dark:text-emerald-400">
                             <Settings2 size={18} />
                         </div>
                         <h3 className="font-semibold text-stone-700 dark:text-stone-200">Panel Konfiguracji</h3>
                    </div>
                    <button 
                        onClick={() => setAreSettingsOpen(!areSettingsOpen)}
                        className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition-colors"
                    >
                        {areSettingsOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>
                </div>
                
                {/* Deck Content */}
                {areSettingsOpen && (
                    <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
                        {/* Column 1: Filters (Left) */}
                        <div className="lg:col-span-4 space-y-4">
                            <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">Filtrowanie</h4>
                            <Toggle 
                                label="Pomiń drzewa do usunięcia" 
                                subLabel="Usuwa wiersze z kodem 'Uo'"
                                checked={removeUoRows} 
                                onChange={setRemoveUoRows}
                            />

                            <Toggle 
                                label="Pomiń pozycje bez wyceny" 
                                subLabel="Usuwa puste wiersze lub 0 PLN"
                                checked={removeZeroPriceRows} 
                                onChange={setRemoveZeroPriceRows}
                            />

                            <Toggle 
                                label="Zachowaj oryginalne Lp." 
                                subLabel="Nie zmieniaj numeracji po usunięciu wierszy"
                                checked={preserveLp} 
                                onChange={setPreserveLp}
                            />
                        </div>

                        {/* Column 2: Standard Pricing (Middle) */}
                        <div className="lg:col-span-4 space-y-4 border-l border-r border-stone-100 px-4 dark:border-stone-700/50">
                             <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">Cennik Podstawowy</h4>
                             <div className="grid grid-cols-2 gap-4">
                                <NumberInput label="Cena WE" value={wePrice} onChange={setWePrice} unit="zł" />
                                <NumberInput label="Cena W2t" value={w2tPrice} onChange={setW2tPrice} unit="zł" />
                                <NumberInput label="Cena W4t" value={w4tPrice} onChange={setW4tPrice} unit="zł" />
                                <NumberInput label="Cena KU" value={kuPrice} onChange={setKuPrice} unit="zł" />
                             </div>
                             <div className="pt-4 border-t border-stone-100 dark:border-stone-700/50">
                                <NumberInput label="Mnożnik CS / CR / CP" value={csMultiplier} onChange={setCsMultiplier} unit="x" />
                             </div>
                        </div>

                        {/* Column 3: Custom CS Table (Right) */}
                        <div className="lg:col-span-4 space-y-4">
                            <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">Tabela Stawek (Po Mnożniku)</h4>
                            <div className="bg-stone-50 rounded-xl border border-stone-200 p-2 max-h-[280px] overflow-y-auto custom-scrollbar dark:bg-stone-900 dark:border-stone-700">
                                <table className="w-full text-sm">
                                    <thead className="text-xs text-stone-500 sticky top-0 bg-stone-50 dark:bg-stone-900 z-10 shadow-sm">
                                        <tr>
                                            <th className="text-left pb-2 pl-2">Obwód (cm)</th>
                                            <th className="text-right pb-2 pr-2">Cena (zł)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {DEFAULT_PRICING_SCHEDULE.map((tier, index) => (
                                            <tr key={index} className="border-b border-stone-100 last:border-0 hover:bg-white transition-colors dark:border-stone-800 dark:hover:bg-stone-800">
                                                <td className="py-2 pl-2 text-stone-600 font-medium dark:text-stone-400">{tier.min} - {tier.max}</td>
                                                <td className="py-1 pr-1">
                                                     <input 
                                                        type="number"
                                                        value={Math.ceil(customCsPrices[index] * csMultiplier)}
                                                        onChange={(e) => handleCustomCsPriceChange(index, Number(e.target.value))}
                                                        className="w-20 px-2 py-1 text-right text-stone-800 bg-white border border-stone-200 rounded focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none text-xs font-semibold dark:bg-stone-800 dark:border-stone-700 dark:text-stone-200"
                                                      />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* 2. ACTIONS BAR */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-stone-200 sticky top-24 z-10 dark:bg-stone-800 dark:border-stone-700">
                 <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="bg-stone-100 p-2 rounded-lg text-stone-500 dark:bg-stone-700 dark:text-stone-400">
                        <Leaf size={20} />
                    </div>
                    <div>
                        <h4 className="font-semibold text-stone-800 text-sm dark:text-stone-200">{fileName}</h4>
                        <span className="text-xs text-stone-500 flex items-center gap-1 dark:text-stone-400"><Check size={10} className="text-emerald-500"/> Gotowe do eksportu</span>
                    </div>
                 </div>

                 <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button
                        onClick={handleReset}
                        className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 text-stone-600 hover:bg-stone-100 hover:text-red-600 rounded-lg text-sm font-medium transition-colors border border-transparent hover:border-stone-200 dark:text-stone-400 dark:hover:bg-stone-700"
                    >
                        <Trash2 size={16} />
                        Odrzuć
                    </button>
                    
                    <div className="relative flex-1 sm:flex-none" ref={downloadMenuRef}>
                        <button
                          onClick={() => setIsDownloadMenuOpen(prev => !prev)}
                          className="w-full inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold shadow-md shadow-emerald-200 dark:shadow-none transition-all"
                        >
                          <FileDown size={18} />
                          Pobierz Kosztorys
                        </button>
                        {isDownloadMenuOpen && (
                          <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl z-30 border border-stone-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200 dark:bg-stone-800 dark:border-stone-600">
                            <div className="px-4 py-3 bg-stone-50 border-b border-stone-100 dark:bg-stone-900 dark:border-stone-700">
                                <span className="text-xs font-bold text-stone-400 uppercase">Format</span>
                            </div>
                            <ul className="py-1">
                              <li>
                                <button
                                  onClick={(e) => { e.preventDefault(); handleDownloadDocx(); setIsDownloadMenuOpen(false); }}
                                  className="w-full text-left px-4 py-3 text-sm text-stone-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors flex items-center gap-2 dark:text-stone-300 dark:hover:bg-stone-700 dark:hover:text-emerald-400"
                                >
                                  <span className="font-bold">.DOCX</span> <span className="text-stone-400 text-xs font-normal ml-auto">Word</span>
                                </button>
                              </li>
                              <li>
                                <button
                                  onClick={(e) => { e.preventDefault(); handleDownloadPdf(); setIsDownloadMenuOpen(false); }}
                                  className="w-full text-left px-4 py-3 text-sm text-stone-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors flex items-center gap-2 border-t border-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-700 dark:hover:text-emerald-400"
                                >
                                   <span className="font-bold">.PDF</span> <span className="text-stone-400 text-xs font-normal ml-auto">Adobe</span>
                                </button>
                              </li>
                            </ul>
                          </div>
                        )}
                    </div>
                 </div>
            </div>

            {/* 3. TABLE PREVIEW */}
            <TablePreview 
                tables={result.tables} 
                onDeleteRow={handleDeleteRow}
                onDeleteColumn={handleDeleteColumn}
            />

          </div>
        )}
      </main>

      <footer className="bg-stone-100 border-t border-stone-200 py-8 dark:bg-stone-950 dark:border-stone-800">
         <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
           <p className="text-stone-400 text-sm">
             &copy; {new Date().getFullYear()} Kalkulator Drzewostanu AI.
           </p>
           <div className="flex items-center gap-2 text-stone-400 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              System gotowy do pracy
           </div>
         </div>
      </footer>
    </div>
  );
};

export default App;