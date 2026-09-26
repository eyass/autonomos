import { DocArticle, docMetadata } from "@/components/marketing/doc-article";
import { DOCS } from "@/components/marketing/docs";

const doc = DOCS[0]!;

export const metadata = docMetadata(doc);

export default function DocsIndexPage() {
  return <DocArticle doc={doc} />;
}
