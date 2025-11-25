import { GoogleGenAI, Type } from "@google/genai";
import { ExtractionResult } from "../types";
import mammoth from "mammoth";

// Initialize the client
// Note: API key is assumed to be available in process.env.API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Converts a File object to an ArrayBuffer.
 */
const fileToArrayBuffer = (file: File): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        resolve(event.target.result as ArrayBuffer);
      } else {
        reject(new Error("Failed to read file"));
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};

/**
 * Sends the DOCX file content (converted to HTML) to Gemini to extract tables.
 */
export const extractTablesFromDocx = async (file: File): Promise<ExtractionResult> => {
  try {
    // 1. Convert DOCX to HTML client-side using Mammoth.
    // Gemini cannot process raw DOCX binary via inlineData, so we extract the structure as HTML.
    const arrayBuffer = await fileToArrayBuffer(file);
    const { value: htmlContent, messages } = await mammoth.convertToHtml({ arrayBuffer });

    if (messages.length > 0) {
      console.log("Mammoth conversion messages:", messages);
    }

    // 2. Prepare the prompt with the HTML content.
    const prompt = `
      Analyze the following HTML content extracted from a DOCX document.
      
      TASK 1: Extract Document Header Information
      Look at the very beginning of the document (before any tables) for header lines.
      - 'title': The main document title. Often in UPPERCASE. Example: "KOSZTORYS NA WYKONANIE PRAC...".
      - 'location': The specific place name or address. Example: "Cmentarz komunalny w miejscowości...", "Park miejski...", "Aleja...".
      - 'townName': From the 'location' text, extract ONLY the main town/city/village name. It should be a single word or a short phrase. For example, if location is "Cmentarz komunalny w miejscowości Sopot", townName should be "Sopot". If location is "Park miejski Warszawa", townName should be "Warszawa". If no clear town name can be found, leave this field empty.
      - 'administrativeDetails': Administrative region details. Look for keywords like "gmina", "powiat", "woj.".
      
      TASK 2: Extract Tables
      Your task is to identify and extract ALL tables found within the document structure.
      Ignore all paragraph text, images, headers, and footers that are outside of the <table> elements or not relevant to the tabular data.
      
      For each table found:
      1. Identify if it has a header row. If the first row (tr) or table header (th) contains labels, extract it as 'headers'.
      2. Extract the remaining rows as 'rows'.
      3. If there is no clear header, put all data in 'rows' and leave 'headers' empty.
      4. Look for a preceding heading (h1-h6) or paragraph immediately before the table to use as the 'title'.
      
      Clean up the cell content:
      - Remove HTML tags from the cell values (keep only plain text).
      - Trim whitespace.
      
      Return the data in a structured JSON format fitting the schema.
    `;

    // 3. Call Gemini with the HTML text.
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            text: prompt,
          },
          {
            text: htmlContent,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            metadata: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, nullable: true },
                location: { type: Type.STRING, nullable: true },
                townName: { type: Type.STRING, nullable: true },
                administrativeDetails: { type: Type.STRING, nullable: true },
              },
            },
            tables: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING, nullable: true },
                  headers: { 
                    type: Type.ARRAY, 
                    items: { type: Type.STRING } 
                  },
                  rows: { 
                    type: Type.ARRAY, 
                    items: { 
                      type: Type.ARRAY, 
                      items: { type: Type.STRING } 
                    } 
                  },
                },
                required: ["headers", "rows"],
              },
            },
          },
          required: ["tables"],
        },
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response received from the model.");
    }

    const result = JSON.parse(text) as ExtractionResult;
    return result;

  } catch (error) {
    console.error("Error processing document:", error);
    throw error;
  }
};
