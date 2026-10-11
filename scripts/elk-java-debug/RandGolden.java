import java.util.Random;

/** 生成 JavaRandom 黄金向量 (JVM 21 权威值). */
public class RandGolden {
    static void section(String name) { System.out.println("### " + name); }
    public static void main(String[] args) {
        long[] seeds = {1L, 42L, 123456789L};
        for (long seed : seeds) {
            section("seed " + seed);
            Random r = new Random(seed);
            // nextLong 低 48 位 (ggn setSeed 用)
            System.out.print("nextLong48:");
            for (int i = 0; i < 8; i++) System.out.print(" " + (r.nextLong() & ((1L << 48) - 1)));
            System.out.println();
            r = new Random(seed);
            System.out.print("nextLong64:");
            for (int i = 0; i < 4; i++) System.out.print(" " + r.nextLong());
            System.out.println();
            r = new Random(seed);
            System.out.print("nextBoolean:");
            for (int i = 0; i < 8; i++) System.out.print(" " + r.nextBoolean());
            System.out.println();
            r = new Random(seed);
            System.out.print("nextFloat:");
            for (int i = 0; i < 8; i++) System.out.print(" " + r.nextFloat());
            System.out.println();
            r = new Random(seed);
            System.out.print("nextDouble:");
            for (int i = 0; i < 8; i++) System.out.print(" " + r.nextDouble());
            System.out.println();
            r = new Random(seed);
            System.out.print("nextInt100:");
            for (int i = 0; i < 8; i++) System.out.print(" " + r.nextInt(100));
            System.out.println();
        }
    }
}
