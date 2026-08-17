import { RelativeModuleResolverService } from './relative-module-resolver.service';

describe('RelativeModuleResolverService', () => {
  const service = new RelativeModuleResolverService();

  it('creates ordered file and index candidates for extensionless imports', () => {
    expect(
      service.createCandidatePaths(
        'src/services/doctor.service.ts',
        '../data/repository',
      ),
    ).toEqual([
      'src/data/repository.ts',
      'src/data/repository.tsx',
      'src/data/repository.js',
      'src/data/repository.jsx',
      'src/data/repository.json',
      'src/data/repository/index.ts',
      'src/data/repository/index.tsx',
      'src/data/repository/index.js',
      'src/data/repository/index.jsx',
      'src/data/repository/index.json',
    ]);
  });

  it('maps emitted JavaScript imports back to TypeScript candidates first', () => {
    expect(
      service.createCandidatePaths('src/app.ts', './doctor.service.js'),
    ).toEqual([
      'src/doctor.service.ts',
      'src/doctor.service.tsx',
      'src/doctor.service.js',
    ]);
  });

  it('treats dotted NestJS module basenames as extensionless imports', () => {
    expect(
      service.createCandidatePaths(
        'src/services/doctor.service.ts',
        '../repositories/doctor.repository',
      ),
    ).toEqual(
      expect.arrayContaining([
        'src/repositories/doctor.repository.ts',
        'src/repositories/doctor.repository.tsx',
        'src/repositories/doctor.repository/index.ts',
      ]),
    );
  });

  it('does not resolve packages, aliases, or paths escaping the repository', () => {
    expect(service.createCandidatePaths('src/app.ts', '@app/service')).toEqual(
      [],
    );
    expect(service.createCandidatePaths('src/app.ts', 'typeorm')).toEqual([]);
    expect(service.createCandidatePaths('src/app.ts', '../../outside')).toEqual(
      [],
    );
  });
});
