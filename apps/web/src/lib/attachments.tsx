import { LoaderCircle } from "lucide-react";
import { ALLOWED_VIDEO_TYPES, ALLOWED_AUDIO_TYPES } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { ContextDocument } from "@opencanvas/shared/types";
import { createClient } from "@supabase/supabase-js";

// FFmpeg removed — not needed for text-only teaching prototype.
// Stub types so the rest of the code compiles.
type FFmpeg = { loaded: boolean };

export function arrayToFileList(files: File[] | undefined) {
  if (!files || !files.length) return undefined;
  const dt = new DataTransfer();
  files?.forEach((file) => dt.items.add(file));
  return dt.files;
}

export function contextDocumentToFile(document: ContextDocument): File {
  if (document.type === "text") {
    // For text documents, create file directly from the text data
    const blob = new Blob([document.data], { type: "text/plain" });
    return new File([blob], document.name, { type: "text/plain" });
  }

  // For non-text documents, handle as base64
  let base64String = document.data;
  if (base64String.includes(",")) {
    base64String = base64String.split(",")[1];
  }

  // Fix padding if necessary
  while (base64String.length % 4 !== 0) {
    base64String += "=";
  }

  // Clean the string (remove whitespace and invalid characters)
  base64String = base64String.replace(/\s/g, "");

  try {
    // Convert base64 to binary
    const binaryString = atob(base64String);

    // Convert binary string to Uint8Array
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Create Blob from the bytes
    const blob = new Blob([bytes], { type: document.type });

    // Create File object
    return new File([blob], document.name, { type: document.type });
  } catch (error) {
    console.error("Error converting data to file:", error);
    throw error;
  }
}

export async function transcribeAudio(file: File, userId: string) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL_DOCUMENTS ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_DOCUMENTS
  ) {
    throw new Error(
      "Supabase credentials for uploading context documents are missing"
    );
  }
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL_DOCUMENTS,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_DOCUMENTS
  );

  const res = await client.storage
    .from("documents")
    .upload(
      `${userId}/${new Date().getTime()}-${file.name.replaceAll("/", "-").replaceAll(" ", "-")}`,
      file,
      {
        upsert: true,
      }
    );
  if (res.error) {
    throw new Error(`Failed to upload context document: ${res.error.message}`);
  }

  const result = await fetch("/api/whisper/audio", {
    method: "POST",
    body: JSON.stringify({
      path: res.data.path,
    }),
  });
  if (!result.ok) {
    throw new Error("Failed to transcribe audio");
  }
  const data = await result.json();
  return data.text;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(
          `Failed to convert file to base64. Received ${typeof reader.result} result.`
        );
      }
    };
    reader.onerror = (error) => reject(error);
  });
}

const MAX_AUDIO_SIZE = 26214400;

export async function load(
  _ffmpeg: FFmpeg,
  _messageRef: React.RefObject<HTMLDivElement>
) {
  // FFmpeg removed — video/audio upload not supported in teaching prototype
  console.warn("FFmpeg is not available — video/audio upload disabled");
}

export async function convertToAudio(
  _videoFile: File,
  _ffmpeg: FFmpeg
): Promise<File | null> {
  // FFmpeg was removed — skip gracefully so one video cannot reject the batch.
  console.warn(
    "Video-to-audio conversion is not available — FFmpeg was removed; skipping file"
  );
  return null;
}

export interface ConvertDocumentsProps {
  ffmpeg: FFmpeg;
  messageRef: React.RefObject<HTMLDivElement>;
  documents: FileList;
  userId: string;
  toast: ReturnType<typeof useToast>["toast"];
}

export async function convertDocuments({
  ffmpeg,
  messageRef,
  documents,
  userId,
  toast,
}: ConvertDocumentsProps): Promise<ContextDocument[]> {
  const files = Array.from(documents);
  const includesVideoFile = files.some((file) =>
    ALLOWED_VIDEO_TYPES.has(file.type)
  );
  if (includesVideoFile) {
    // Load FFmpeg
    await load(ffmpeg, messageRef);
  }

  const documentsPromise = Array.from(documents).map(async (doc) => {
    try {
      const isAudio = ALLOWED_AUDIO_TYPES.has(doc.type);
      const isVideo = ALLOWED_VIDEO_TYPES.has(doc.type);

      if (isAudio) {
        if (doc.size > MAX_AUDIO_SIZE) {
          toast({
            title: "Failed to transcribe audio",
            description: `Audio file "${doc.name}" is larger than the max size of 26214400 bytes. Received ${doc.size} bytes.`,
            variant: "destructive",
            duration: 7500,
          });
          return null;
        }

        toast({
          title: "Transcribing audio",
          description: (
            <span className="flex items-center gap-2">
              Transcribing audio {doc.name}. This may take a while. Please wait{" "}
              <LoaderCircle className="animate-spin w-4 h-4" />
            </span>
          ),
          duration: 15000,
        });

        const transcription = await transcribeAudio(doc, userId);

        toast({
          title: "Successfully transcribed audio",
          description: `Transcribed audio ${doc.name}.`,
        });

        return {
          name: doc.name,
          type: "text",
          data: transcription,
        };
      }

      if (isVideo) {
        toast({
          title: "Converting video to audio",
          description: (
            <span className="flex items-center gap-2">
              Converting video {doc.name} to audio. This may take a while.
              Please wait <LoaderCircle className="animate-spin w-4 h-4" />
            </span>
          ),
          duration: 15000,
        });

        // Convert video to audio (stub may return null)
        const audioFile = await convertToAudio(doc, ffmpeg);
        if (!audioFile) {
          toast({
            title: "Video not supported",
            description: `Skipping video "${doc.name}" — conversion is unavailable.`,
            variant: "destructive",
            duration: 7500,
          });
          return null;
        }

        if (audioFile.size > MAX_AUDIO_SIZE) {
          toast({
            title: "Failed to transcribe video",
            description: `Audio for video "${doc.name}" is larger than the max size of 26214400 bytes. Received ${audioFile.size} bytes.`,
            variant: "destructive",
            duration: 7500,
          });
          return null;
        }

        toast({
          title: "Successfully converted video to audio",
          description: (
            <span className="flex items-center gap-2">
              Video to audio conversion completed for {doc.name}. Transcribing
              audio now. This may take a while. Please wait{" "}
              <LoaderCircle className="animate-spin w-4 h-4" />
            </span>
          ),
          duration: 60000,
        });
        // Transcribe audio to video
        const transcription = await transcribeAudio(audioFile, userId);

        toast({
          title: "Successfully transcribed video",
          description: `Transcribed video ${doc.name}.`,
        });

        return {
          name: doc.name,
          type: "text",
          data: transcription,
        };
      }

      return {
        name: doc.name,
        type: doc.type,
        data: await fileToBase64(doc),
      };
    } catch (error) {
      console.warn(`Failed to convert document "${doc.name}"; skipping`, error);
      toast({
        title: "Failed to process file",
        description: `Skipping "${doc.name}".`,
        variant: "destructive",
        duration: 7500,
      });
      return null;
    }
  });
  const documentsResult = (await Promise.all(documentsPromise)).filter(
    (x) => x !== null
  );
  return documentsResult;
}
