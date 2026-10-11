import java.util.*;
import org.eclipse.elk.core.options.PortSide;
public class Instr14Main {
    public static void main(String[] args) {
        Map<PortSide, String> m = new HashMap<>();
        m.put(PortSide.EAST, "e");
        m.put(PortSide.WEST, "w");
        System.out.println("hashmap order EAST,WEST -> " + m.keySet());
        Map<PortSide, String> m2 = new HashMap<>();
        m2.put(PortSide.WEST, "w");
        m2.put(PortSide.EAST, "e");
        System.out.println("hashmap order WEST,EAST -> " + m2.keySet());
    }
}
