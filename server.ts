import "dotenv/config";
import express, { Response, Request, NextFunction } from "express";
import ExpressWs from "express-ws";
import VoiceResponse from "twilio/lib/twiml/VoiceResponse";
import { ElevenLabsClient } from "elevenlabs";
import { type WebSocket } from "ws";
import { type Readable } from "stream";
import twilio from "twilio";
import cors from "cors";

const app = ExpressWs(express()).app;
const PORT: number = parseInt(process.env.PORT || "3001");

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(
  cors({
    origin: "http://localhost:3000",
  })
);

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

const outputFormat = "ulaw_8000";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

// In-memory storage for messages (in a production environment, use a database)
const messageStore: { [key: string]: string } = {};

// Twilio request validation middleware
const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  const twilioSignature = req.headers["x-twilio-signature"] as string;
  const url = `${process.env.SERVER_DOMAIN}${req.originalUrl}`;
  const params = req.body;

  if (twilio.validateRequest(authToken!, twilioSignature, url, params)) {
    next();
  } else {
    res.status(403).send("Invalid Twilio request");
  }
};

function startApp() {
  app.post("/call", async (req: Request, res: Response) => {
    const { to, message } = req.body;

    if (!to) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    try {
      console.log(`Initiating call to ${to} with message: ${message}`);
      const call = await client.calls.create({
        from: process.env.TWILIO_PHONE_NUMBER || "",
        to: to,
        url: `${process.env.SERVER_DOMAIN}/call/incoming`,
      });

      // Store the message with the call SID
      messageStore[call.sid] = message;

      console.log(`Call initiated with SID: ${call.sid}`);
      res.status(200).json({ sid: call.sid });
    } catch (error: any) {
      console.error("Twilio call error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/call/incoming", validateRequest, (req: Request, res: Response) => {
    console.log("Incoming call received");
    console.log("Request body:", req.body);

    const callSid = req.body.CallSid;
    const message = messageStore[callSid] || "This is a default message.";

    console.log("Message to be spoken:", message);

    const twiml = new VoiceResponse();

    twiml.connect().stream({
      url: `wss://${
        new URL(process.env.SERVER_DOMAIN || "").hostname
      }/call/connection`,
    });

    console.log("TwiML generated:", twiml.toString());

    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end(twiml.toString());
  });

  app.ws("/call/connection", (ws: WebSocket) => {
    console.log("WebSocket connection established");
    const voiceId = process.env.ELEVENLABS_VOICE_ID;
    if (!voiceId) {
      throw new Error(
        "ELEVENLABS_VOICE_ID is not set in the environment variables"
      );
    }
    ws.on("message", async (data: string) => {
      console.log("WebSocket message received:", data);

      try {
        const message: {
          event: string;
          start?: { streamSid: string; callSid: string };
        } = JSON.parse(data);

        if (message.event === "start" && message.start) {
          console.log("Start event received, generating audio");
          console.log("Start event data:", message.start);

          const streamSid = message.start.streamSid;
          const callSid = message.start.callSid;
          const textToSpeak =
            messageStore[callSid] || "This is a default message.";

          console.log("Text to be spoken:", textToSpeak);

          const response = await elevenlabs.textToSpeech.convert(voiceId, {
            model_id: "eleven_turbo_v2",
            output_format: outputFormat,
            text: textToSpeak,
          });

          console.log("Audio generated successfully");

          const audioArrayBuffer = await streamToArrayBuffer(response);

          ws.send(
            JSON.stringify({
              streamSid,
              event: "media",
              media: {
                payload: Buffer.from(audioArrayBuffer as any).toString(
                  "base64"
                ),
              },
            })
          );

          console.log("Audio sent over WebSocket");

          // Clean up the message store
          delete messageStore[callSid];
        }
      } catch (error) {
        console.error("Error in WebSocket message handler:", error);
      }
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  });

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Local: http://localhost:${PORT}`);
    console.log(`Remote: ${process.env.SERVER_DOMAIN}`);
  });
}

function streamToArrayBuffer(readableStream: Readable) {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    readableStream.on("data", (chunk) => {
      chunks.push(chunk);
    });

    readableStream.on("end", () => {
      resolve(Buffer.concat(chunks).buffer);
    });

    readableStream.on("error", reject);
  });
}

startApp();
