import { ExtractedTable, CalculatedTotals } from "../types";

interface PricingTier {
  min: number;
  max: number;
  price: number;
}

interface ProcessingOptions {
  removeUoRows?: boolean;
  preserveLp?: boolean; // If true, keeps original Lp. If false, re-indexes 1..N
  weBasePrice?: number; // Configurable price for WE treatments
  useSpecificWePrices?: boolean; // Whether to use separate prices for W2t/W4t
  w2tPrice?: number;
  w4tPrice?: number;
  // CS Customization
  useCustomCsPricing?: boolean;
  csMultiplier?: number;
  customCsPrices?: number[]; // Array of prices matching the indices of DEFAULT_PRICING_SCHEDULE
}

// Pricing compartments for CS (Cięcia sanitarne)
export const DEFAULT_PRICING_SCHEDULE: PricingTier[] = [
  { min: 0, max: 100, price: 365.00 },
  { min: 101, max: 150, price: 396.00 },
  { min: 151, max: 200, price: 424.00 },
  { min: 201, max: 250, price: 456.00 },
  { min: 251, max: 300, price: 582.00 },
  { min: 301, max: 350, price: 648.00 },
  { min: 351, max: 400, price: 731.00 },
  { min: 401, max: 450, price: 814.00 },
  { min: 451, max: 500, price: 825.00 },
  { min: 501, max: 550, price: 883.00 },
  { min: 551, max: 600, price: 940.00 },
  { min: 601, max: 650, price: 998.00 },
  { min: 651, max: 700, price: 1056.00 },
];

const VAT_RATE = 0.08; // 8%

export const processTablesWithPricing = (
  tables: ExtractedTable[], 
  options: ProcessingOptions = {}
): { 
  processedTables: ExtractedTable[], 
  totals: CalculatedTotals 
} => {
  let totalNetto = 0;
  let totalBrutto = 0;

  // Determine base prices
  const baseWePrice = options.weBasePrice !== undefined ? options.weBasePrice : 800.00;
  
  // Determine specific prices or fallback to base
  const w2tPrice = (options.useSpecificWePrices && options.w2tPrice !== undefined) 
    ? options.w2tPrice 
    : baseWePrice;
    
  const w4tPrice = (options.useSpecificWePrices && options.w4tPrice !== undefined) 
    ? options.w4tPrice 
    : baseWePrice;

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
        // CS symbols
        if (valLower.includes('cs') || valLower.includes('cięc') || valLower.includes('ciec')) {
           score.treat += 5;
        } 
        // WE symbols (W2t, W4t, WE)
        else if (valLower.includes('w2t') || valLower.includes('w4t') || /\bwe\b/.test(valLower)) {
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

    // --- FILTERING (Happens before pricing check) ---
    let rowsToProcess = table.rows;
    
    if (options.removeUoRows && bestTreatIdx !== -1) {
      rowsToProcess = rowsToProcess.filter(row => {
        const treatCell = row[bestTreatIdx] || "";
        // Normalize: trim whitespace, lowercase, remove trailing dot
        const normalized = treatCell.trim().toLowerCase().replace(/\.$/, '');
        const forbidden = ['uo', 'u'];
        // Return false to remove the row
        return !forbidden.includes(normalized);
      });

      // --- RE-INDEXING LP (Column 0) ---
      // If we are removing rows and user did NOT ask to preserve Lp,
      // we assume Column 0 is "Lp" and re-number it sequentially.
      if (!options.preserveLp && rowsToProcess.length > 0) {
         rowsToProcess = rowsToProcess.map((row, index) => {
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
    }

    // --- PRICING CHECK ---
    // If we failed to identify both columns needed for pricing, return the (filtered) rows as is.
    if (bestCircIdx === -1 || bestTreatIdx === -1) {
      return {
        ...table,
        rows: rowsToProcess
      };
    }

    // --- CALCULATION ---
    const newHeaders = [...table.headers];
    // Only add pricing headers if we have headers to begin with
    if (newHeaders.length > 0) {
      newHeaders.push("Cena Netto (PLN)", "Cena Brutto (PLN)");
    }

    const newRows: string[][] = [];

    for (const row of rowsToProcess) {
      const circCell = row[bestCircIdx] || "";
      const treatCell = row[bestTreatIdx] || "";
      const tLower = treatCell.toLowerCase();

      let rowPriceNetto = 0;

      // 1. Calculate CS Price
      const isCS = tLower.includes('cs') || tLower.includes('cięc') || tLower.includes('ciec');
      if (isCS) {
        const match = circCell.match(/(\d+)/);
        if (match) {
          const cm = parseInt(match[1], 10);
          const tierIndex = DEFAULT_PRICING_SCHEDULE.findIndex(t => cm >= t.min && cm <= t.max);
          
          if (tierIndex !== -1) {
            // Start with base price from default schedule
            let basePrice = DEFAULT_PRICING_SCHEDULE[tierIndex].price;
            
            // Override if custom pricing is enabled and provided
            if (options.useCustomCsPricing && options.customCsPrices && options.customCsPrices[tierIndex] !== undefined) {
               basePrice = options.customCsPrices[tierIndex];
            }

            // Apply Multiplier if enabled
            if (options.useCustomCsPricing && options.csMultiplier !== undefined) {
              basePrice = basePrice * options.csMultiplier;
            }

            rowPriceNetto += basePrice;
          }
        }
      }

      // 2. Calculate WE / W2t / W4t Price
      
      // Check for multiplier "2x", "3 x" etc.
      let multiplier = 1;
      const multMatch = treatCell.match(/(\d+)\s*x/i) || treatCell.match(/x\s*(\d+)/i);
      if (multMatch) {
         multiplier = parseInt(multMatch[1], 10);
      }

      // Priority Check: W4t -> W2t -> Generic WE
      if (tLower.includes('w4t')) {
        rowPriceNetto += (w4tPrice * multiplier);
      } else if (tLower.includes('w2t')) {
        rowPriceNetto += (w2tPrice * multiplier);
      } else if (/\bwe\b/i.test(tLower)) {
        rowPriceNetto += (baseWePrice * multiplier);
      }

      // Add VAT and push
      if (rowPriceNetto > 0) {
        const rowPriceBrutto = rowPriceNetto * (1 + VAT_RATE);
        totalNetto += rowPriceNetto;
        totalBrutto += rowPriceBrutto;
        newRows.push([...row, rowPriceNetto.toFixed(2), rowPriceBrutto.toFixed(2)]);
      } else {
        newRows.push([...row, "", ""]);
      }
    }

    return {
      ...table,
      headers: newHeaders,
      rows: newRows,
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