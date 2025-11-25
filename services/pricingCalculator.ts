import { ExtractedTable, CalculatedTotals } from "../types";

interface PricingTier {
  min: number;
  max: number;
  price: number;
}

interface ProcessingOptions {
  removeUoRows?: boolean;
  removeZeroPriceRows?: boolean;
  preserveLp?: boolean;
  wePrice?: number;
  w2tPrice?: number;
  w4tPrice?: number;
  kuPrice?: number;
  // CS Customization
  csMultiplier?: number;
  customCsPrices?: number[]; // Array of prices matching the indices of DEFAULT_PRICING_SCHEDULE
}

// Pricing compartments for CS (Cięcia sanitarne)
export const DEFAULT_PRICING_SCHEDULE: PricingTier[] = [
  { min: 0, max: 100, price: 730.00 },
  { min: 101, max: 150, price: 792.00 },
  { min: 151, max: 200, price: 848.00 },
  { min: 201, max: 250, price: 912.00 },
  { min: 251, max: 300, price: 1164.00 },
  { min: 301, max: 350, price: 1296.00 },
  { min: 351, max: 400, price: 1462.00 },
  { min: 401, max: 450, price: 1628.00 },
  { min: 451, max: 500, price: 1650.00 },
  { min: 501, max: 550, price: 1766.00 },
  { min: 551, max: 600, price: 1880.00 },
  { min: 601, max: 650, price: 1996.00 },
  { min: 651, max: 700, price: 2112.00 },
];

const VAT_RATE = 0.08; // 8%

// --- HELPER: HEADER DETECTION ---
const strongHeaderKeywords = ['lp.', 'lp', 'nr na mapie', 'nazwa gatunku', 'obwód', 'obwod', 'zabiegi', 'pielęgnacyjne', 'wartość', 'netto', 'brutto', 'kod'];

const normalizeText = (text: string) => text.toLowerCase().replace(/[\s\r\n\t.,;:]/g, '');

const isHeaderRow = (row: string[], referenceHeaders: string[] = []) => {
    const rowText = row.join(' ').toLowerCase();
    
    // Strategy A: Static Keyword Hits
    let keywordHits = 0;
    strongHeaderKeywords.forEach(kw => {
        if (rowText.includes(kw)) keywordHits++;
    });
    
    if (keywordHits >= 3) return true;
    if (keywordHits >= 2 && (rowText.includes('lp') || rowText.includes('nr'))) return true;

    // Strategy B: Comparison with Extracted Headers
    if (referenceHeaders.length > 0) {
        let matchScore = 0;
        let comparisons = 0;
        const colsToCheck = Math.min(referenceHeaders.length, row.length);

        for (let i = 0; i < colsToCheck; i++) {
            const h = normalizeText(referenceHeaders[i] || '');
            const r = normalizeText(row[i] || '');
            
            if (!h && !r) continue;
            
            comparisons++;
            if (h === r) {
                matchScore += 1;
            } else if ((h.length > 3 || r.length > 3) && (h.includes(r) || r.includes(h))) {
                matchScore += 0.8;
            }
        }
        
        if (comparisons > 0 && (matchScore / comparisons) > 0.5) return true;
    }

    return false;
};

// --- HELPER: TABLE MERGING ---
const mergeCompatibleTables = (tables: ExtractedTable[]): ExtractedTable[] => {
  if (tables.length === 0) return [];

  const merged: ExtractedTable[] = [];
  let currentTable = { ...tables[0], rows: [...tables[0].rows] };

  for (let i = 1; i < tables.length; i++) {
    const nextTable = tables[i];
    
    // Compatibility Checks
    const colDiff = Math.abs(currentTable.headers.length - nextTable.headers.length);
    const sameHeaders = JSON.stringify(currentTable.headers) === JSON.stringify(nextTable.headers);
    const headersLookSimilar = isHeaderRow(nextTable.headers, currentTable.headers);
    
    // If tables look like they belong together (same structure or same headers)
    if (sameHeaders || headersLookSimilar || (colDiff <= 1 && nextTable.headers.length > 3)) {
       // Merge rows
       currentTable.rows = [...currentTable.rows, ...nextTable.rows];
    } else {
       // Push finished table and start new one
       merged.push(currentTable);
       currentTable = { ...nextTable, rows: [...nextTable.rows] };
    }
  }
  merged.push(currentTable);
  return merged;
};

export const processTablesWithPricing = (
  rawTables: ExtractedTable[], 
  options: ProcessingOptions = {}
): { 
  processedTables: ExtractedTable[], 
  totals: CalculatedTotals 
} => {
  
  // 1. Merge fragmented tables first
  const tables = mergeCompatibleTables(rawTables);

  let totalNetto = 0;
  let totalBrutto = 0;

  // Determine prices with defaults
  const wePrice = options.wePrice ?? 800.00;
  const w2tPrice = options.w2tPrice ?? 800.00;
  const w4tPrice = options.w4tPrice ?? 1200.00;
  const kuPrice = options.kuPrice ?? 500.00;

  const processedTables = tables.map(table => {
    // We need to identify which column index corresponds to "Circumference" (Obwód)
    // and which corresponds to "Treatment" (Zabiegi).
    
    const columnScores = new Map<number, { circ: number, treat: number }>();
    
    // Helper to initialize or get score object
    const getScore = (idx: number) => {
      if (!columnScores.has(idx)) {
        columnScores.set(idx, { circ: 0, treat: 0 });
      }
      return columnScores.get(idx)!;
    };

    // --- STRATEGY 1: Header Keywords (High Confidence) ---
    if (table.headers && table.headers.length > 0) {
      table.headers.forEach((header, idx) => {
        const h = header.toLowerCase().trim();
        const score = getScore(idx);

        // Keywords for Circumference
        if (h.includes('obw') || h.includes('cm') || h.includes('wymiar') || h.includes('srednica') || h.includes('średnica')) {
          score.circ += 50; 
        }

        // Keywords for Treatment
        if (h.includes('zabieg') || h.includes('czynnoś') || h.includes('czynnos') || h.includes('opis') || h.includes('kod')) {
          score.treat += 50;
        }
      });
    }

    // --- STRATEGY 2: Content Analysis ---
    table.rows.forEach(row => {
      row.forEach((cell, idx) => {
        if (!cell) return;
        const val = cell.toString().trim();
        const valLower = val.toLowerCase();
        const score = getScore(idx);

        // Check for Treatment Content
        const csKeywords = ['cs', 'cięc', 'ciec', 'cr', 'cp'];
        
        // CS symbols
        if (csKeywords.some(kw => valLower.includes(kw))) {
           score.treat += 5;
        } 
        // WE symbols (W2t, W4t, WE)
        else if (valLower.includes('w2t') || valLower.includes('w4t') || /\bwe\b/.test(valLower)) {
           score.treat += 5;
        }
        // KU symbol
        else if (valLower.includes('ku')) {
            score.treat += 5;
        }
        // Uo symbols
        else if (['uo', 'u', 'uo.', 'u.'].includes(valLower)) {
           score.treat += 2;
        }

        // Check for Circumference Content (Numeric)
        const numberMatch = val.match(/^(\d+)/);
        if (numberMatch) {
          const num = parseInt(numberMatch[1], 10);
          if (!isNaN(num) && num >= 0 && num <= 900) {
            score.circ += 1;
          }
        }
      });
    });

    // --- SELECTION ---
    let bestCircIdx = -1;
    let maxCircScore = 0;
    let bestTreatIdx = -1;
    let maxTreatScore = 0;

    for (const [idx, score] of columnScores.entries()) {
      if (score.circ > maxCircScore) {
        maxCircScore = score.circ;
        bestCircIdx = idx;
      }
      if (score.treat > maxTreatScore) {
        maxTreatScore = score.treat;
        bestTreatIdx = idx;
      }
    }

    // Resolve conflict if same column selected for both
    if (bestCircIdx !== -1 && bestCircIdx === bestTreatIdx) {
      if (maxTreatScore >= maxCircScore) {
        bestCircIdx = -1; 
      } else {
        bestTreatIdx = -1; 
      }
    }

    let rowsToProcess = [...table.rows];

    // --- HEADER DEDUPLICATION (Rows) ---
    // Remove ANY row that looks like a header (first row, or rows in the middle from page breaks)
    // We pass the current table headers as reference for comparison.
    rowsToProcess = rowsToProcess.filter(row => !isHeaderRow(row, table.headers));
    
    // --- UO FILTERING ---
    if (options.removeUoRows && bestTreatIdx !== -1) {
      rowsToProcess = rowsToProcess.filter(row => {
        const treatCell = row[bestTreatIdx] || "";
        // Normalize: trim whitespace, lowercase, remove trailing dot
        const normalized = treatCell.trim().toLowerCase().replace(/\.$/, '');
        const forbidden = ['uo', 'u'];
        // Return false to remove the row
        return !forbidden.includes(normalized);
      });
    }

    // --- PRICING CHECK ---
    // If we failed to identify both columns needed for pricing, return the (filtered) rows as is.
    if (bestCircIdx === -1 || bestTreatIdx === -1) {
      return {
        ...table,
        rows: rowsToProcess
      };
    }

    // --- CALCULATION & HEADER UPDATES ---
    // Clone headers or create empty array if undefined
    const newHeaders = [...(table.headers || [])];
    
    // Rename identified columns to match the requested standard report format
    if (bestCircIdx !== -1 && newHeaders[bestCircIdx]) {
        newHeaders[bestCircIdx] = "Obwód pnia\nmierz.\nna wys. 130 cm\n[cm]";
    }
    if (bestTreatIdx !== -1 && newHeaders[bestTreatIdx]) {
        newHeaders[bestTreatIdx] = "Zabiegi\npielęgnacyjne";
    }
    
    // Rename other common columns if they exist at expected positions
    // Check Col 0 for Lp
    if (newHeaders.length > 0) {
        const h0 = newHeaders[0].toLowerCase();
        if (h0.includes('lp') || h0 === '1' || h0 === '' || h0 === 'no') {
            newHeaders[0] = "Lp.";
        }
    }
    // Check Col 1 for Species (only if it's not the identified circ/treat column)
    if (newHeaders.length > 1 && bestCircIdx !== 1 && bestTreatIdx !== 1) {
        const h1 = newHeaders[1].toLowerCase();
        // Heuristic: if it contains "gatun", "nazwa" or is generally text-like column
        if (h1.includes('gatun') || h1.includes('nazwa') || h1 === '') {
             newHeaders[1] = "Nazwa gatunku\n[polska/łacińska]";
        }
    }

    // Append the Price Headers
    if (newHeaders.length > 0) {
      newHeaders.push(
          "Wartość\nzabiegów\npielęgnacyjnych\n[netto]\n[PLN]", 
          "Wartość\nzabiegów\npielęgnacyjnych\n[brutto]\n[PLN]"
      );
    }

    const newRows: string[][] = [];

    // Formatter to remove .00
    const formatPrice = (val: number): string => {
        const fixed = val.toFixed(2);
        return fixed.endsWith('.00') ? fixed.slice(0, -3) : fixed;
    };

    for (const row of rowsToProcess) {
      const circCell = row[bestCircIdx] || "";
      const treatCell = row[bestTreatIdx] || "";
      const tLower = treatCell.toLowerCase();

      let rowPriceNetto = 0;

      // 1. Calculate CS / CR / CP Price
      let csFamilyTreatmentCount = 0;
      
      // Check for CS type treatments
      if (['cs', 'cięc', 'ciec'].some(kw => tLower.includes(kw))) {
          csFamilyTreatmentCount++;
      }
      // Check for CR type treatments
      if (['cr'].some(kw => tLower.includes(kw))) {
          csFamilyTreatmentCount++;
      }
      // Check for CP type treatments
      if (['cp'].some(kw => tLower.includes(kw))) {
          csFamilyTreatmentCount++;
      }
      
      if (csFamilyTreatmentCount > 0) {
        const match = circCell.match(/(\d+)/);
        if (match) {
          const cm = parseInt(match[1], 10);
          const tierIndex = DEFAULT_PRICING_SCHEDULE.findIndex(t => cm >= t.min && cm <= t.max);
          
          if (tierIndex !== -1) {
            // Start with base price from default schedule
            let basePrice = DEFAULT_PRICING_SCHEDULE[tierIndex].price;
            
            // Override with custom pricing if provided
            if (options.customCsPrices && options.customCsPrices[tierIndex] !== undefined) {
               basePrice = options.customCsPrices[tierIndex];
            }

            // Apply Multiplier
            if (options.csMultiplier !== undefined) {
              basePrice = Math.ceil(basePrice * options.csMultiplier);
            }

            rowPriceNetto += (basePrice * csFamilyTreatmentCount);
          }
        }
      }

      // Helper function to find and sum multipliers for a specific treatment code.
      // It looks for patterns like "2x CODE", "CODE x 2", and sums them up if multiple exist.
      const getTreatmentCount = (text: string, code: string): number => {
          // Use matchAll to find all occurrences of the pattern globally and case-insensitively.
          const pattern = new RegExp(`(?:(\\d+)\\s*x\\s*)?\\b(${code})\\b(?:\\s*x\\s*(\\d+))?`, 'ig');
          const matches = [...text.matchAll(pattern)];

          if (matches.length === 0) {
              return 0; // Code not found
          }

          let totalCount = 0;
          for (const match of matches) {
              // match[1] is the multiplier before (e.g., "2x code")
              // match[3] is the multiplier after (e.g., "code x2")
              // If no multiplier is found for this specific instance, it counts as 1.
              totalCount += parseInt(match[1] || match[3] || '1', 10);
          }
          
          return totalCount;
      };

      // 2. Calculate WE / W2t / W4t Price
      const w4tCount = getTreatmentCount(treatCell, 'w4t');
      const w2tCount = getTreatmentCount(treatCell, 'w2t');
      const weCount = getTreatmentCount(treatCell, 'we');
      
      // Maintain priority: if a higher-tier treatment is found, ignore lower tiers.
      if (w4tCount > 0) {
          rowPriceNetto += (w4tPrice * w4tCount);
      } else if (w2tCount > 0) {
          rowPriceNetto += (w2tPrice * w2tCount);
      } else if (weCount > 0) {
          rowPriceNetto += (wePrice * weCount);
      }
      
      // 3. Calculate KU Price (Independently)
      const kuCount = getTreatmentCount(treatCell, 'ku');
      if (kuCount > 0) {
          rowPriceNetto += (kuPrice * kuCount);
      }

      // Add VAT and push
      if (rowPriceNetto > 0) {
        const rowPriceBrutto = rowPriceNetto * (1 + VAT_RATE);
        totalNetto += rowPriceNetto;
        totalBrutto += rowPriceBrutto;
        newRows.push([...row, formatPrice(rowPriceNetto), formatPrice(rowPriceBrutto)]);
      } else {
        if (options.removeZeroPriceRows) {
            continue;
        }
        newRows.push([...row, "", ""]);
      }
    }

    // --- FINAL CLEANUP: Remove empty rows and re-index ---
    // 1. Remove rows where all cells after the first (Lp.) are empty.
    const nonEmptyRows = newRows.filter(row => 
      row.slice(1).some(cell => cell && cell.trim() !== '')
    );

    let finalRows = nonEmptyRows;

    // 2. If original Lp is not preserved, re-number the first column sequentially.
    // This corrects numbering after any rows (Uo, empty, or zero-priced) have been removed.
    if (!options.preserveLp && finalRows.length > 0) {
      finalRows = finalRows.map((row, index) => {
        const firstCell = row[0];
        // Only re-index if the first cell looks like a number (e.g. "1", "1.", "01")
        // This prevents overwriting if col 0 is actually a Name or something else.
        if (firstCell && /^[\d.]+$/.test(firstCell.trim())) {
           const newRow = [...row];
           newRow[0] = (index + 1).toString();
           return newRow;
        }
        return row;
      });
    }

    return {
      ...table,
      headers: newHeaders,
      rows: finalRows,
    };
  });

  return {
    processedTables,
    totals: {
      totalNetto: parseFloat(totalNetto.toFixed(2)),
      totalBrutto: parseFloat(totalBrutto.toFixed(2)),
    }
  };
};