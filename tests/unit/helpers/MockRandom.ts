/**
 * 对应 ELK TestGraphCreator.MockRandom.
 * 可控随机: nextBoolean 固定值; nextDouble 步进 (changeBy 可调, 默认 0.01 从 0.01 起).
 */
export class MockRandom {
  private nextBooleanVal = true
  private changeBy = 0.01
  private currentDouble = 0.01

  nextBoolean(): boolean {
    return this.nextBooleanVal
  }

  nextDouble(): number {
    this.currentDouble += this.changeBy
    return this.currentDouble
  }

  nextFloat(): number {
    return this.nextDouble()
  }

  nextInt(bound = 0): number {
    return 0
  }

  nextLong(): number {
    return 0
  }

  setSeed(_seed: number): void {}

  setNextBoolean(b: boolean): void {
    this.nextBooleanVal = b
  }

  setChangeBy(d: number): void {
    this.changeBy = d
  }
}
