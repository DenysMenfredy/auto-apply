// The package entrypoint runs demo code when imported outside its own repo,
// so we import the library file directly and type it here.
declare module "pdf-parse/lib/pdf-parse.js" {
  import pdfParse from "pdf-parse";

  export default pdfParse;
}
