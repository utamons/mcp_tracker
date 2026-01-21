export class Logger {
  warn(message: string, meta?: object): void {
    if (meta === undefined) {
      console.warn(message);
      return;
    }

    console.warn(message, meta);
  }
}
