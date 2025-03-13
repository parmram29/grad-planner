import React, { useState, useEffect } from "react";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import Papa from "papaparse";
import * as XLSX from "xlsx";

const localizer = momentLocalizer(moment);

/**
 * derives the learner group based on provided fields.
 */
const deriveLearnerGroup = (learnerGroupField, sessionName, sectionName) => {
  let group = "";
  const expectedPattern = /^[A-H][1-2]$/i;
  
  if (learnerGroupField) {
    group = learnerGroupField.toString().trim();
    if (!expectedPattern.test(group)) {
      group = "";
    }
  }
  
  if (!group && sectionName) {
    const match = sectionName.match(/([A-H])\s*([1-2])/i);
    if (match) group = match[1] + match[2];
  }
  
  if (!group && sessionName) {
    const match = sessionName.match(/([A-H])\s*([1-2])/i);
    if (match) group = match[1] + match[2];
  }
  
  return group ? group.trim().toUpperCase() : "Ungrouped";
};

/**
 * Fix any known invalid date strings.
 */
const fixInvalidDate = (dateInput) => {
  if (dateInput instanceof Date) {
    return moment(dateInput).format("YYYYMMDD");
  }
  if (typeof dateInput !== "string") {
    dateInput = dateInput.toString();
  }
  if (dateInput.startsWith("+057342")) {
    return dateInput.replace("+057342", "2023");
  }
  return dateInput;
};

/**
 * parses a time value into an object with hours and minutes.
 */
const parseTime = (timeValue) => {
  try {
    if (!timeValue) return null;
    if (timeValue instanceof Date) {
      return { hours: timeValue.getHours(), minutes: timeValue.getMinutes() };
    }
    const cleaned = timeValue.toString().trim().toLowerCase();
    // Military time format (e.g., 13:45)
    const militaryMatch = cleaned.match(/^(\d{1,2}):?(\d{2})$/);
    if (militaryMatch) {
      const hours = parseInt(militaryMatch[1], 10);
      const minutes = parseInt(militaryMatch[2] || "00", 10);
      if (hours > 23 || minutes > 59) return null;
      return { hours, minutes };
    }
    // 12-hour format (e.g., 1:30 pm, noon, midnight)
    const twelveHourMatch =
      cleaned.match(/(\d{1,2})(?::(\d{2}))?\s*([ap]m)/i) ||
      cleaned.match(/(noon|midnight)/i);
    if (twelveHourMatch) {
      let hours = twelveHourMatch[1] ? parseInt(twelveHourMatch[1], 10) : 0;
      const minutes = twelveHourMatch[2] ? parseInt(twelveHourMatch[2], 10) : 0;
      const period = twelveHourMatch[3]?.toLowerCase();
      if (period === "noon") hours = 12;
      if (period === "midnight") hours = 0;
      if (period === "pm" && hours !== 12) hours += 12;
      if (period === "am" && hours === 12) hours = 0;
      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
      return { hours, minutes };
    }
    console.warn(`Unrecognized time format: ${timeValue}`);
    return null;
  } catch (error) {
    console.error("Time parsing error:", error);
    return null;
  }
};

/**
 * date string and time value into a Date object.
 */
const parseDateTime = (dateString, timeValue) => {
  try {
    if (!dateString || !timeValue) {
      console.warn("Missing date/time values:", { dateString, timeValue });
      return null;
    }
    const fixedDateString = fixInvalidDate(dateString);
    
    // handle potential Excel date numbers
    if (!isNaN(fixedDateString)) {
      const numDate = parseInt(fixedDateString, 10);
      if (numDate < 100000) {
        const excelDate = numDate;
        const date = new Date((excelDate - 25569) * 86400 * 1000);
        if (excelDate > 59) date.setDate(date.getDate() - 1);
        const time = parseTime(timeValue);
        if (!time) return null;
        date.setHours(time.hours, time.minutes);
        return date;
      }
    }
    
    const dateFormats = [
      "YYYYMMDD",
      "YYYY-MM-DD",
      "MM/DD/YYYY",
      "DD-MM-YYYY",
      "MMM DD, YYYY",
      "DD MMM YYYY",
      "YYYY/MM/DD",
    ];
    const date = moment(fixedDateString, dateFormats, true);
    if (!date.isValid()) {
      console.warn(`Invalid date format: ${fixedDateString}`);
      return null;
    }
    
    const time = parseTime(timeValue);
    if (!time) return null;
    
    const combined = date.set({ hour: time.hours, minute: time.minutes }).toDate();
    if (isNaN(combined.getTime())) {
      console.warn("Invalid combined datetime:", combined);
      return null;
    }
    return combined;
  } catch (error) {
    console.error("Date/time parsing error:", error);
    return null;
  }
};

/**
 * Main Calendar Component
 */
const MyCalendar = () => {
  const [events, setEvents] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [view, setView] = useState("calendar");
  const [uploadStatus, setUploadStatus] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("All Groups");
  const [availableGroups, setAvailableGroups] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);


  useEffect(() => {
    const groupsSet = new Set(events.map((event) => event.learnerGroup));
    let groups = Array.from(groupsSet).filter((g) => g && g !== "");
    
    // Ensure "Ungrouped" is pushed to the end
    const ungroupedIndex = groups.indexOf("Ungrouped");
    if (ungroupedIndex > -1) {
      groups.splice(ungroupedIndex, 1);
    }
    
    groups.sort((a, b) => {
      const regex = /([A-Za-z])\s*([1-2])/;
      const matchA = a.match(regex);
      const matchB = b.match(regex);
      if (matchA && matchB) {
        const letterA = matchA[1].toUpperCase();
        const letterB = matchB[1].toUpperCase();
        if (letterA === letterB) {
          return parseInt(matchA[2], 10) - parseInt(matchB[2], 10);
        }
        return letterA.localeCompare(letterB);
      }
      return a.localeCompare(b);
    });
    
    if (ungroupedIndex > -1) {
      groups.push("Ungrouped");
    }
    
    setAvailableGroups(["All Groups", ...groups]);
  }, [events]);

  /**
   * handles file upload and delegates to excel or CSV processing.
   */
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsProcessing(true);
    setUploadStatus("Processing file...");
    setEvents([]);

    try {
      if (
        file.type.includes("spreadsheet") ||
        file.name.match(/\.(xlsx|xls)$/i)
      ) {
        processExcelFile(file);
      } else if (
        file.type === "text/csv" ||
        file.name.endsWith(".csv")
      ) {
        processCSVFile(file);
      } else {
        setUploadStatus("Unsupported file type");
        setIsProcessing(false);
      }
    } catch (error) {
      console.error("File upload error:", error);
      setUploadStatus("Error processing file");
      setIsProcessing(false);
    }
  };

  /**
   * processes an Excel file upload.
   */
  const processExcelFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (jsonData.length < 1) {
          throw new Error("Empty Excel file");
        }

        const headerRow = jsonData[0].map((h) => h.toString().toLowerCase());
        const requiredHeaders = ["section date", "start time", "end time"];
        if (!requiredHeaders.every((h) => headerRow.includes(h))) {
          throw new Error("Missing required columns in Excel file");
        }

        const parsedEvents = jsonData.slice(1).flatMap((row, index) => {
          try {
            const getExcelField = (name) => {
              const idx = headerRow.indexOf(name.toLowerCase());
              return idx >= 0 ? row[idx] : "";
            };

            const courseName = getExcelField("Course Name");
            const sessionType = getExcelField("Session Type");
            const sessionName = getExcelField("Session Name");
            // Use "Section Name" or fallback to "Section"
            const sectionName =
              getExcelField("Section Name") || getExcelField("Section");
            const sectionDateRaw = getExcelField("Section Date");
            const sectionDate =
              sectionDateRaw instanceof Date
                ? moment(sectionDateRaw).format("YYYYMMDD")
                : sectionDateRaw.toString().trim();

            const startTime = getExcelField("Start Time");
            const endTime = getExcelField("End Time");
            const learnerGroupField = getExcelField("Learner Group");
            const learnerGroup = deriveLearnerGroup(
              learnerGroupField,
              sessionName,
              sectionName
            );

            if (!sectionDate || typeof sectionDate !== "string") {
              console.warn(`Skipping row ${index + 1}: Missing section date`);
              return [];
            }
            if (
              sectionDate.match(/[a-zA-Z]/) &&
              !moment(sectionDate, "YYYYMMDD", true).isValid()
            ) {
              console.warn(
                `Skipping row ${index + 1}: Invalid date format "${sectionDate}"`
              );
              return [];
            }

            let start = parseDateTime(sectionDate, startTime);
            let end = parseDateTime(sectionDate, endTime);
            if (!start || !end) {
              console.warn(`Skipping row ${index + 1}: Invalid date/time`);
              return [];
            }
            // adjust end time if needed
            if (start >= end) {
              const adjustedEnd = moment(end).add(1, "days").toDate();
              if (start < adjustedEnd) {
                end = adjustedEnd;
              } else {
                console.warn(
                  `Skipping row ${index + 1}: End time is before start time even after adjustment`
                );
                return [];
              }
            }

            return {
              title: sessionName || "Untitled Session",
              start: new Date(start),
              end: new Date(end),
              desc: [courseName, sessionType, sectionName].filter(Boolean).join(" - "),
              location: getExcelField("Location") || "Unknown Location",
              learnerGroup: learnerGroup,
            };
          } catch (e) {
            console.warn(`Skipping row ${index + 1}:`, e);
            return [];
          }
        }).filter(
          (event) =>
            event.start instanceof Date && event.end instanceof Date
        );

        setEvents(parsedEvents);
        setUploadStatus(`Loaded ${parsedEvents.length} valid events from Excel`);
      } catch (error) {
        console.error("Excel processing error:", error);
        setUploadStatus("Error: Invalid Excel file structure");
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  /**
   * processes a CSV file upload.
   */
  const processCSVFile = (file) => {
    Papa.parse(file, {
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedEvents = results.data.flatMap((row, index) => {
          try {
            const getField = (name) =>
              row[
                Object.keys(row).find(
                  (key) => key.toLowerCase() === name.toLowerCase()
                )
              ] || "";

            const sectionDate = getField("Section Date");
            const startTime = getField("Start Time");
            const endTime = getField("End Time");
            const sessionName = getField("Session Name");
            const sectionName =
              getField("Section Name") || getField("Section");
            const learnerGroupField = getField("Learner Group");
            const learnerGroup = deriveLearnerGroup(
              learnerGroupField,
              sessionName,
              sectionName
            );

            if (!sectionDate || typeof sectionDate !== "string") {
              console.warn(`Skipping row ${index + 1}: Missing section date`);
              return [];
            }
            if (
              sectionDate.match(/[a-zA-Z]/) &&
              !moment(sectionDate, "YYYYMMDD", true).isValid()
            ) {
              console.warn(
                `Skipping row ${index + 1}: Invalid date format "${sectionDate}"`
              );
              return [];
            }

            let start = parseDateTime(sectionDate, startTime);
            let end = parseDateTime(sectionDate, endTime);
            if (!start || !end) return [];
            if (start >= end) {
              const adjustedEnd = moment(end).add(1, "days").toDate();
              if (start < adjustedEnd) {
                end = adjustedEnd;
              } else {
                console.warn(
                  `Skipping row ${index + 1}: End time is before start time even after adjustment`
                );
                return [];
              }
            }

            return {
              title: sessionName || "Untitled Session",
              start: new Date(start),
              end: new Date(end),
              desc: [
                getField("Course Name"),
                getField("Session Type"),
                getField("Section Name"),
              ]
                .filter(Boolean)
                .join(" - "),
              location: getField("Location") || "Unknown Location",
              learnerGroup: learnerGroup,
            };
          } catch (e) {
            console.warn(`Skipping row ${index + 1}:`, e);
            return [];
          }
        }).filter(
          (event) =>
            event.start instanceof Date && event.end instanceof Date
        );

        setEvents(parsedEvents);
        setUploadStatus(`Loaded ${parsedEvents.length} valid events from CSV`);
        setIsProcessing(false);
      },
      error: (error) => {
        console.error("CSV parsing error:", error);
        setUploadStatus("Error processing CSV file");
        setIsProcessing(false);
      },
    });
  };

  // Optional: Filter events by selected group (currently using all events)
  const filteredEvents = events;

  // Color mapping for different learner groups
  const groupColors = {
    A1: "#f87171",
    A2: "#fb923c",
    B1: "#facc15",
    B2: "#a3e635",
    C1: "#34d399",
    C2: "#2dd4bf",
    D1: "#60a5fa",
    D2: "#818cf8",
    E1: "#a78bfa",
    E2: "#f472b6",
    F1: "#ec4899",
    F2: "#f472b6",
    G1: "#d97706",
    G2: "#f59e0b",
    H1: "#10b981",
    H2: "#06b6d4",
  };

  const handleSelectSlot = (slotInfo) => {
    setSelectedSlot({
      start: slotInfo.start,
      end: slotInfo.end,
    });
  };

  const handleDateDoubleClick = (date) => {
    const start = moment(date).startOf("hour");
    let end = moment(start).add(1, "hour");
    if (end.date() !== start.date()) {
      end = moment(start).endOf("day");
    }
    setSelectedSlot({
      start: start.toDate(),
      end: end.toDate(),
    });
  };

  const handleAddEvent = (newEvent) => {
    if (newEvent.end <= newEvent.start) {
      alert("End time must be after start time!");
      return;
    }
    setEvents([...events, newEvent]);
    setSelectedSlot(null);
  };

  const handleUpdateEvent = (updatedEvent) => {
    setEvents(
      events.map((evt) => (evt === selectedEvent ? updatedEvent : evt))
    );
    setSelectedEvent(null);
  };

  const handleDeleteEvent = (eventToDelete) => {
    setEvents(events.filter((evt) => evt !== eventToDelete));
    setSelectedEvent(null);
  };

  return (
    <div className="p-4">
      {/* File Upload Section */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">
          Upload Schedule (Excel/CSV)
        </label>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileUpload}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          disabled={isProcessing}
        />
      </div>

      {/* Status Messages */}
      {isProcessing && (
        <div className="mt-4 p-4 bg-blue-50 text-blue-700 rounded">
          Processing file... (This may take a moment)
        </div>
      )}
      {uploadStatus && !isProcessing && (
        <div className="mt-4 p-4 bg-blue-50 text-blue-700 rounded">
          {uploadStatus} (Total events: {events.length})
        </div>
      )}

      {/* Group Filter */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Filter by Group:</label>
        <select
          value={selectedGroup}
          onChange={(e) => setSelectedGroup(e.target.value)}
          className="w-full p-2 border rounded"
          disabled={isProcessing}
        >
          {availableGroups.map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </select>
      </div>

      {/* View Toggle */}
      <div className="flex gap-4 mb-4">
        <button
          onClick={() => setView("calendar")}
          className={`px-4 py-2 rounded ${
            view === "calendar" ? "bg-blue-500 text-white" : "bg-gray-200"
          }`}
        >
          Calendar View
        </button>
        <button
          onClick={() => setView("agenda")}
          className={`px-4 py-2 rounded ${
            view === "agenda" ? "bg-blue-500 text-white" : "bg-gray-200"
          }`}
        >
          Agenda View
        </button>
      </div>

      {/* Calendar Display */}
      {view === "calendar" && (
        <div style={{ height: "70vh" }}>
          <Calendar
            localizer={localizer}
            events={filteredEvents}
            startAccessor="start"
            endAccessor="end"
            selectable
            onSelectSlot={handleSelectSlot}
            onSelectEvent={(event) => setSelectedEvent(event)}
            onDoubleClickEvent={handleDateDoubleClick}
            defaultView="week"
            views={["month", "week", "day"]}
            eventPropGetter={(event) => {
              const backgroundColor =
                groupColors[event.learnerGroup] || "#3b82f6";
              return {
                style: {
                  backgroundColor,
                  borderRadius: "4px",
                  border: "none",
                  color: "white",
                },
              };
            }}
          />
        </div>
      )}

      {/* Debug Information (Visible in development only) */}
      {process.env.NODE_ENV === "development" && (
        <div className="mt-8 p-4 bg-gray-100 rounded">
          <h3 className="font-bold mb-4">Debug Information</h3>
          <div className="text-sm">
            <p>Filtered Events: {filteredEvents.length}</p>
            <p>Total Events: {events.length}</p>
            <pre className="mt-4 text-xs">
              {JSON.stringify(
                filteredEvents.slice(0, 3).map((event) => ({
                  ...event,
                  start: event.start?.toISOString(),
                  end: event.end?.toISOString(),
                })),
                null,
                2
              )}
            </pre>
          </div>
        </div>
      )}

      {/* Modal for Adding/Editing Events */}
      {(selectedSlot || selectedEvent) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg w-96">
            <h2 className="text-xl font-bold mb-4">
              {selectedSlot ? "Add Event" : "Edit Event"}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const start = new Date(formData.get("start"));
                const end = new Date(formData.get("end"));
                if (moment(start).date() !== moment(end).date()) {
                  if (!confirm("⚠️ This event spans multiple days. Continue?"))
                    return;
                }
                const newEvent = {
                  title: formData.get("title"),
                  start,
                  end,
                };
                if (newEvent.end <= newEvent.start) {
                  alert("End time must be after start time!");
                  return;
                }
                selectedSlot
                  ? handleAddEvent(newEvent)
                  : handleUpdateEvent(newEvent);
              }}
            >
              <input
                type="text"
                name="title"
                defaultValue={selectedEvent?.title || ""}
                placeholder="Event Title"
                className="w-full p-2 border rounded mb-4"
                required
              />
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm mb-1">Start Time</label>
                  <input
                    type="datetime-local"
                    name="start"
                    defaultValue={
                      selectedSlot
                        ? moment(selectedSlot.start).format("YYYY-MM-DDTHH:mm")
                        : moment(selectedEvent?.start).format("YYYY-MM-DDTHH:mm")
                    }
                    className="w-full p-2 border rounded"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">End Time</label>
                  <input
                    type="datetime-local"
                    name="end"
                    defaultValue={
                      selectedSlot
                        ? moment(selectedSlot.end).format("YYYY-MM-DDTHH:mm")
                        : moment(selectedEvent?.end).format("YYYY-MM-DDTHH:mm")
                    }
                    className="w-full p-2 border rounded"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
                >
                  {selectedSlot ? "Create Event" : "Save Changes"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSlot(null);
                    setSelectedEvent(null);
                  }}
                  className="flex-1 bg-gray-500 text-white p-2 rounded hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyCalendar;
