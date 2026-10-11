import com.google.common.collect.ArrayListMultimap;
import org.eclipse.elk.core.options.PortSide;
public class Instr16Main {
    public static void main(String[] args) {
        ArrayListMultimap<PortSide, String> m = ArrayListMultimap.create(PortSide.values().length, 2);
        m.put(PortSide.EAST, "e");
        m.put(PortSide.WEST, "w");
        System.out.println("ArrayListMultimap(4,2) EAST,WEST keyset=" + m.keySet());
        ArrayListMultimap<PortSide, String> m2 = ArrayListMultimap.create(4, 2);
        m2.put(PortSide.WEST, "w");
        m2.put(PortSide.EAST, "e");
        System.out.println("ArrayListMultimap(4,2) WEST,EAST keyset=" + m2.keySet());
        ArrayListMultimap<PortSide, String> m3 = ArrayListMultimap.create(4, 2);
        m3.put(PortSide.NORTH, "n"); m3.put(PortSide.EAST, "e"); m3.put(PortSide.SOUTH, "s"); m3.put(PortSide.WEST, "w");
        System.out.println("ArrayListMultimap(4,2) all4 keyset=" + m3.keySet());
    }
}
