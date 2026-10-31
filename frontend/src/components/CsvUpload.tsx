import { useState } from "react";
import { importAssets } from "../services/api";

interface Props {
  onSuccess: () => void;
}

export default function CsvUpload({ onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  async function handleUpload() {
    if (!file) { setResult("Please select a CSV file first."); return; }
    setUploading(true);
    setResult("");
    try {
      const data = await importAssets(file);
      setResult(`✅ Imported ${data.imported} asset(s). Failed rows: ${data.failed}.${data.errors.length ? "\n" + data.errors.join("\n") : ""}`);
      setFile(null);
      onSuccess();
    } catch (err: unknown) {
      setResult(`❌ ${err instanceof Error ? err.message : "Import failed"}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">
        CSV Import
      </label>
      <input
        type="file"
        accept=".csv"
        onChange={e => setFile(e.target.files?.[0] ?? null)}
        className="text-sm text-gray-600 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
      />
      <button
        onClick={handleUpload}
        disabled={uploading || !file}
        className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-50"
      >
        {uploading ? "Uploading..." : "Upload CSV"}
      </button>
      {result && (
        <p className={`text-xs whitespace-pre-line ${result.startsWith("✅") ? "text-green-600" : "text-red-600"}`}>
          {result}
        </p>
      )}
    </div>
  );
}
