"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function Home() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [message, setMessage] = useState("");
  const [callStatus, setCallStatus] = useState("");

  const handleCall = async () => {
    setCallStatus("Initiating call...");
    try {
      const response = await fetch("http://localhost:3001/call", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ to: phoneNumber, message }),
      });
      const data = await response.json();
      if (response.ok) {
        setCallStatus(`Call initiated. SID: ${data.sid}`);
      } else {
        setCallStatus(`Error: ${data.error}`);
      }
      console.log("API response:", data);
    } catch (error) {
      console.error("API call failed:", error);
      setCallStatus("Failed to initiate call. Check console for details.");
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="space-y-4 w-full max-w-md">
        <h1 className="text-2xl font-bold">Neurox Call Agent</h1>
        <input
          type="text"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder="Enter phone number"
          className="w-full border p-2 rounded"
        />
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Enter your message"
          className="w-full border p-2 rounded h-32"
        />
        <Button onClick={handleCall} className="w-full">
          Initiate Call
        </Button>
        {callStatus && <p className="mt-4">{callStatus}</p>}
      </div>
    </main>
  );
}
