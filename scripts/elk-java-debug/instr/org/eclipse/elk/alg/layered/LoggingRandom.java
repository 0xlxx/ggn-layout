package org.eclipse.elk.alg.layered;

import java.util.Random;

/** ELK_INSTR: 记录每次 next* 调用的 Random 子类 (与 ggn JavaRandom 打点对齐). */
public class LoggingRandom extends Random {
    private static final long serialVersionUID = 1L;
    public static int seq = 0;

    public LoggingRandom() { super(); }
    public LoggingRandom(long seed) { super(seed); }

    @Override
    protected int next(int bits) {
        int v = super.next(bits);
        System.err.println("ELK_RND " + (seq++) + " next bits=" + bits + " v=" + v);
        return v;
    }
    @Override
    public boolean nextBoolean() {
        boolean v = super.nextBoolean();
        System.err.println("ELK_RND " + (seq++) + " nextBoolean v=" + v);
        return v;
    }
    @Override
    public int nextInt() {
        int v = super.nextInt();
        System.err.println("ELK_RND " + (seq++) + " nextInt() v=" + v);
        return v;
    }
    @Override
    public int nextInt(int bound) {
        int v = super.nextInt(bound);
        System.err.println("ELK_RND " + (seq++) + " nextInt(" + bound + ") v=" + v);
        return v;
    }
    @Override
    public long nextLong() {
        long v = super.nextLong();
        System.err.println("ELK_RND " + (seq++) + " nextLong v=" + v);
        return v;
    }
    @Override
    public float nextFloat() {
        float v = super.nextFloat();
        System.err.println("ELK_RND " + (seq++) + " nextFloat v=" + v);
        return v;
    }
    @Override
    public double nextDouble() {
        double v = super.nextDouble();
        System.err.println("ELK_RND " + (seq++) + " nextDouble v=" + v);
        return v;
    }
}
