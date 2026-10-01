import { writeFileSync } from "node:fs";
import { LIBRARY_MIGRATION, librarySql } from "../src/playbook-library";

writeFileSync(new URL(`../../../supabase/migrations/${LIBRARY_MIGRATION}`, import.meta.url), librarySql());
console.log(`wrote supabase/migrations/${LIBRARY_MIGRATION}`);
