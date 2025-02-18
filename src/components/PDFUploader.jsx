import { useState } from 'react';

const PDFUploader = () => {
  const [text, setText] = useState('');

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const buffer = e.target.result;

      // Send the file to the API route
      const response = await fetch('/api/parse-pdf', {
        method: 'POST',
        body: buffer,
      });

      const result = await response.json();
      setText(result.text);
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div>
      <input
        type="file"
        accept="application/pdf"
        onChange={handleFileUpload}
      />
      <pre>{text}</pre>
    </div>
  );
};

export default PDFUploader;