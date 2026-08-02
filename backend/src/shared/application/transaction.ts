export interface TransactionManager<TTransaction = unknown> {
  withTransaction<TResult>(
    work: (transaction: TTransaction) => Promise<TResult>,
  ): Promise<TResult>;
}
