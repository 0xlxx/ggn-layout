import java.util.*;
import org.eclipse.elk.core.options.PortSide;
public class Instr15Main {
    public static void main(String[] args) {
        // capacity 4 (Guava ArrayListMultimap.create(4, n) -> HashMap(4))
        Map<PortSide, String> m = new HashMap<>(4);
        for (PortSide s : new PortSide[]{PortSide.NORTH, PortSide.EAST, PortSide.SOUTH, PortSide.WEST}) m.put(s, s.name());
        System.out.println("cap4 all4: " + m.keySet());
        // capacity 8
        Map<PortSide, String> m8 = new HashMap<>(8);
        for (PortSide s : new PortSide[]{PortSide.NORTH, PortSide.EAST, PortSide.SOUTH, PortSide.WEST}) m8.put(s, s.name());
        System.out.println("cap8 all4: " + m8.keySet());
        // identityHashCode values
        for (PortSide s : new PortSide[]{PortSide.NORTH, PortSide.EAST, PortSide.SOUTH, PortSide.WEST}) {
            System.out.println(s + " identityHash=" + System.identityHashCode(s) + " &3=" + (System.identityHashCode(s) & 3));
        }
    }
}
