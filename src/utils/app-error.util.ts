export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
    public readonly errors: Array<{ field: string; message: string }> = []
  ) {
    super(message);
    this.name = 'AppError';
  }
}
