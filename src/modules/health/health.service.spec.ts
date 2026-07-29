import { DataSource } from 'typeorm';
import { HealthService } from './health.service';

describe('HealthService', () => {
  it('reports the database as up when the query succeeds', async () => {
    const query = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const dataSource = {
      isInitialized: true,
      query,
    } as unknown as DataSource;
    const service = new HealthService(dataSource);

    const result = await service.check();

    expect(result.status).toBe('ok');
    expect(result.checks.database.status).toBe('up');
    expect(query).toHaveBeenCalledWith('SELECT 1');
  });

  it('reports the database as down when it is not initialized', async () => {
    const query = jest.fn();
    const dataSource = {
      isInitialized: false,
      query,
    } as unknown as DataSource;
    const service = new HealthService(dataSource);

    const result = await service.check();

    expect(result.status).toBe('error');
    expect(result.checks.database.status).toBe('down');
    expect(query).not.toHaveBeenCalled();
  });

  it('reports the database as down when the query fails', async () => {
    const dataSource = {
      isInitialized: true,
      query: jest.fn().mockRejectedValue(new Error('Connection lost')),
    } as unknown as DataSource;
    const service = new HealthService(dataSource);

    const result = await service.check();

    expect(result.status).toBe('error');
    expect(result.checks.database.status).toBe('down');
  });
});
