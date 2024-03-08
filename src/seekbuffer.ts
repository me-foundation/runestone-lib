export class SeekBuffer {
  public seekIndex: number = 0;

  constructor(private buffer: Buffer) {}

  readUInt8(): number | undefined {
    if (this.isFinished()) {
      return undefined;
    }

    return this.buffer.readUInt8(this.seekIndex++);
  }

  isFinished(): boolean {
    return this.seekIndex >= this.buffer.length;
  }
}
