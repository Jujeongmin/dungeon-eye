declare function describe(name: string, fn: () => void): void;
declare function test(name: string, fn: (server: any) => void | Promise<void>): void;
declare function expect(actual: any): any;
