import org.eclipse.elk.alg.layered.graph.*;
import org.eclipse.elk.alg.layered.options.*;
import org.eclipse.elk.alg.layered.p4nodes.bk.BKNodePlacer;
import org.eclipse.elk.core.options.PortSide;
import org.eclipse.elk.core.util.BasicProgressMonitor;

/** 隔离测试: jar BK 对 E/W 外部端口 dummy 的 y 锚定. */
public class BKAnchorProbe {
    public static void main(String[] args) {
        org.eclipse.elk.core.data.LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        LGraph g = new LGraph();
        g.setProperty(LayeredOptions.NODE_PLACEMENT_FAVOR_STRAIGHT_EDGES, false);
        g.setProperty(LayeredOptions.SPACING_NODE_NODE, 20.0);
        g.setProperty(LayeredOptions.SPACING_EDGE_EDGE, 10.0);
        g.getPadding().set(12, 12, 12, 12);

        Layer l0 = new Layer(g); g.getLayers().add(l0);
        Layer l1 = new Layer(g); g.getLayers().add(l1);

        // WEST dummy at content origin (12,12), size 0x8
        LNode w = new LNode(g);
        w.setType(LNode.NodeType.EXTERNAL_PORT);
        w.setProperty(InternalProperties.EXT_PORT_SIDE, PortSide.WEST);
        w.getSize().set(0, 8);
        w.getPosition().set(12, 12);
        w.setLayer(l0);
        LPort wp = new LPort(); wp.setNode(w); wp.setSide(PortSide.EAST);
        wp.getPosition().set(0, 4);

        // EAST dummy at content origin (12,12), size 0x8
        LNode e = new LNode(g);
        e.setType(LNode.NodeType.EXTERNAL_PORT);
        e.setProperty(InternalProperties.EXT_PORT_SIDE, PortSide.EAST);
        e.getSize().set(0, 8);
        e.getPosition().set(12, 12);
        e.setLayer(l1);
        LPort ep = new LPort(); ep.setNode(e); ep.setSide(PortSide.WEST);
        ep.getPosition().set(0, 4);

        LEdge edge = new LEdge(); edge.setSource(wp); edge.setTarget(ep);

        System.out.println("before BK: WEST y=" + w.getPosition().y + " EAST y=" + e.getPosition().y);
        new BKNodePlacer().process(g, new BasicProgressMonitor());
        System.out.println("after  BK: WEST y=" + w.getPosition().y + " EAST y=" + e.getPosition().y + " offset=" + g.getOffset());
        // LayerSize 之后
        new org.eclipse.elk.alg.layered.intermediate.LayerSizeAndGraphHeightCalculator().process(g, new BasicProgressMonitor());
        System.out.println("after  LS: WEST y=" + w.getPosition().y + " EAST y=" + e.getPosition().y + " size=" + g.getSize() + " offset=" + g.getOffset());
        System.out.println("toString WEST line: " + g.toString().split("\n")[0]);
    }
}
