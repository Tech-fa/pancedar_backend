import { BadRequestException, Logger } from "@nestjs/common";
import * as crypto from "crypto";
import * as jwt from "jsonwebtoken";
import axios from "axios";

import * as bcrypt from "bcrypt";

export interface AppResponse {
  status: number;
  data?: any;
}

export const formatResponse = async (
  logger: Logger,
  dataPromise: Promise<any>,
  response: any,
  endpoint: string,
): Promise<AppResponse> => {
  logger.log(`executing ${endpoint}`);
  try {
    const data = await dataPromise;
    checkForForbiddenAttributes(data);
    response.status(200).send(data);

    logger.log(`returning successful result for ${endpoint}`);
    return data;
  } catch (error) {
    logger.error(error);
    response.status(400).send(
      JSON.stringify({
        message: error?.message,
      }),
    );
    return;
  }
};
function checkForForbiddenAttributes(data: any) {
  function removePassword(obj: any) {
    if (!obj || typeof obj !== "object") return;
    if (obj.password) {
      obj.password = undefined;
    }

    Object.values(obj).forEach((value) => {
      if (value && typeof value === "object") {
        removePassword(value);
      }
    });
  }

  removePassword(data);
}

export async function encrypt(text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const algorithm = "aes-192-cbc";
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY, "GfG", 24);

    const iv = Buffer.alloc(16, 0);

    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = "";

    // Reading data
    cipher.on("readable", () => {
      let chunk;
      while (null !== (chunk = cipher.read())) {
        encrypted += chunk.toString("base64");
      }
    });

    // Handling end event
    cipher.on("end", () => {
      resolve(encrypted);
    });
    cipher.on("error", (err) => {
      reject(err);
    });
    // Writing data
    cipher.write(text);
    cipher.end();
  });
}
export function decrypt(text): Promise<string> {
  return new Promise((resolve, reject) => {
    // Defining algorithm
    const algorithm = "aes-192-cbc";

    // Defining key
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY, "GfG", 24);

    // Defining iv
    const iv = Buffer.alloc(16, 0);

    // Creating decipher
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    // Declaring decrypted
    let decrypted = "";
    // Reading data
    decipher.on("readable", () => {
      let chunk;
      while (null !== (chunk = decipher.read())) {
        decrypted += chunk.toString("utf8");
      }
    });
    // Handling end event
    decipher.on("end", () => {
      resolve(decrypted);
    });

    decipher.on("error", (err) => {
      reject(err);
    });

    decipher.write(text, "base64");
    decipher.end();
  });
}
export function decodeJWT(jwtToken: string) {
  return jwt.decode(jwtToken, { complete: true });
}

export function decodeBase64(b64string: string) {
  const buf = Buffer.from(b64string, "base64");
  return buf.toString("utf-8");
}

export function getHeader(headers, name) {
  const header = headers.find((h) => h.name === name);
  return header ? header.value : "";
}

export function aboutToExpire(epoch) {
  const now = Date.now();
  const fiveMinutesInMillis = 5 * 60 * 1000;
  return epoch <= now + fiveMinutesInMillis;
}

export async function httpCall({
  url,
  method,
  body,
  headers,
}: {
  url: string;
  method: string;
  body?: any;
  headers?: any;
}) {
  const res = await axios.request({ url, method, data: body, headers });
  return res;
}

export async function hashPassword(
  plainText: string,
  skipValidation: boolean = false,
): Promise<string> {
  if (
    !skipValidation &&
    !plainText.match(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&-_])[A-Za-z\d@$!%*?&-_]{8,}$/,
    )
  ) {
    throw new Error(
      "Password must be at least 8 characters long, contain at least one uppercase letter, one lowercase letter, one number, and one special character.",
    );
  }
  const salt = await bcrypt.genSalt();
  return await bcrypt.hash(plainText, salt);
}

export function snakeToCamelCase(str: string): string {
  return str
    .split("_")
    .map((word, index) => {
      if (index === 0) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

export const getStartOfTodayEpoch = (): number => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
};

export const isTimestampWithinToday = (timestamp: number): boolean => {
  const startOfToday = getStartOfTodayEpoch();
  const endOfToday = startOfToday + 24 * 60 * 60 * 1000 - 1; // 23:59:59.999
  return timestamp >= startOfToday && timestamp <= endOfToday;
};
export function parseDecimal(
  value: string | number | undefined | null,
  field: string,
  defaultValue = 0,
): number {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numeric)) {
    throw new BadRequestException(`Invalid number provided for ${field}`);
  }
  return numeric;
}
