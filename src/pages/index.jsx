import MyCalendar from "../components/Calendar";       // Adjusted path
import PDFUploader from "../components/PDFUploader";   // Adjusted path

export default function Home() {
  return (
    <div className="min-h-screen p-8">
      <h1 className="text-3xl font-bold mb-6 text-blue-600">
        Graduate Student Schedule Planner
      </h1>
      <MyCalendar />

      <h1 className="text-3xl font-bold mb-6 text-blue-600 mt-8">
        Welcome to the PDF Parser
      </h1>
      <PDFUploader /> {/* Use the PDFUploader component */}
    </div>
  );
}