declare module "heic-decode" {
  type Decoded = { width: number; height: number; data: Uint8ClampedArray };
  export default function decode(input: { buffer: Uint8Array | ArrayBuffer }): Promise<Decoded>;
}
