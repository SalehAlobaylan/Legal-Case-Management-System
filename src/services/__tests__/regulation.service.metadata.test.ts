import { describe, expect, it, jest } from "@jest/globals";
import { RegulationService } from "../regulation.service";

describe("RegulationService list projection", () => {
  it("excludes heavy sourceMetadata in list query projection", async () => {
    const findMany = jest.fn(async (_args: any) => [] as any[]);
    const countWhere = jest.fn(async () => [{ count: 0 }]);
    const countFrom = jest.fn(() => ({ where: countWhere }));
    const selectMock = jest.fn(() => ({ from: countFrom }));

    const db = {
      query: {
        regulations: {
          findMany,
        },
      },
      select: selectMock,
    };

    const service = new RegulationService(db as any);
    await service.getAllRegulations({ page: 1, limit: 20 });

    expect(findMany).toHaveBeenCalled();
    const findArgs = findMany.mock.calls[0]?.[0] as any;
    expect(findArgs).toBeDefined();
    expect(findArgs.columns.summary).toBe(true);
    expect(findArgs.columns.sourceMetadata).toBeUndefined();
  });
});
