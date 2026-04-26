import { createDb, type Db } from "@toiletpaper/db";
import { env } from "./env";

export const db: Db = createDb(env.DATABASE_URL);
