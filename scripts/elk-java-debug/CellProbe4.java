import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.eclipse.elk.alg.common.nodespacing.NodeLabelAndSizeCalculator;
import org.eclipse.elk.alg.common.nodespacing.internal.NodeContext;
import org.eclipse.elk.alg.common.nodespacing.internal.PortContext;
import org.eclipse.elk.alg.common.nodespacing.internal.algorithm.*;
import org.eclipse.elk.alg.layered.graph.LGraph;
import org.eclipse.elk.alg.layered.graph.LGraphAdapters;
import org.eclipse.elk.alg.layered.graph.LNode;
import org.eclipse.elk.alg.layered.graph.LNode.NodeType;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.alg.ILayoutProcessor;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.options.PortSide;
import org.eclipse.elk.core.testing.TestController;
import org.eclipse.elk.core.testing.TestController.ILayoutExecutionListener;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.core.util.adapters.GraphAdapters.GraphAdapter;
import org.eclipse.elk.core.util.adapters.GraphAdapters.NodeAdapter;
import org.eclipse.elk.graph.ElkNode;

/** 聚焦 LabelInsideAndOutside 的 MyNode2: E/W cell + label cell + margins. */
public class CellProbe4 {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        TestController tc = new TestController("org.eclipse.elk.layered");
        tc.addLayoutExecutionListener(new ILayoutExecutionListener() {
            public void layoutProcessorReady(ILayoutProcessor<?> processor, Object graph, boolean isRoot) {}
            public void layoutProcessorFinished(ILayoutProcessor<?> processor, Object graph, boolean isRoot) {
                if (graph instanceof LGraph && processor.getClass().getSimpleName().contains("LabelAndNodeSize")) {
                    dump((LGraph) graph);
                }
            }
        });
        BasicProgressMonitor m = new BasicProgressMonitor();
        m.begin("root", 1);
        new RecursiveGraphLayoutEngine().layout(root, tc, m);
        m.done();
    }
    static void dump(LGraph g) {
        String parent = g.getParentNode() != null ? g.getParentNode().getDesignation() : "ROOT";
        if (!parent.contains("SeveralBorderNodes_LabelInsideAndOutside")) return;
        GraphAdapter<LGraph> adapter = LGraphAdapters.adapt(g, true, true, node -> node.getType() == NodeType.NORMAL);
        for (NodeAdapter<?> na : adapter.getNodes()) {
            org.eclipse.elk.core.math.KVector size = na.getSize();
            if (size.x < 300) continue;  // only the big MyNode2
            NodeContext ctx = new NodeContext(adapter, na);
            PortContextCreator.createPortContexts(ctx, false);
            NodeLabelCellCreator.createNodeLabelCells(ctx, false, true);
            InsidePortLabelCellCreator.createInsidePortLabelCells(ctx);
            NodeLabelAndSizeUtilities.setupMinimumClientAreaSize(ctx);
            NodeLabelAndSizeUtilities.setupNodePaddingForPortsWithOffset(ctx);
            HorizontalPortPlacementSizeCalculator.calculateHorizontalPortPlacementSize(ctx);
            VerticalPortPlacementSizeCalculator.calculateVerticalPortPlacementSize(ctx);
            CellSystemConfigurator.configureCellSystemSizeContributions(ctx);
            System.out.println("  node size=(" + size.x + "," + size.y + ") midGap=" + ctx.nodeContainerMiddleRow.getGap() + " midMinW=" + ctx.nodeContainerMiddleRow.getMinimumWidth());
            try {
                java.lang.reflect.Method m = ctx.nodeContainerMiddleRow.getClass().getDeclaredMethod("minCellWidths", boolean.class);
                m.setAccessible(true);
                double[] cw = (double[]) m.invoke(ctx.nodeContainerMiddleRow, true);
                System.out.println("    midCells=" + java.util.Arrays.toString(cw));
            } catch (Exception e) { e.printStackTrace(); }
            for (PortSide side : new PortSide[]{PortSide.EAST, PortSide.WEST}) {
                var cell = ctx.insidePortLabelCells.get(side);
                System.out.println("    " + side + " cell content=(" + cell.getMinimumContentAreaSize().x + "," + cell.getMinimumContentAreaSize().y + ") pad=" + cell.getPadding() + " min=(" + cell.getMinimumWidth() + "," + cell.getMinimumHeight() + ")");
                for (PortContext pc : ctx.portContexts.get(side)) {
                    System.out.println("    port side=" + pc.port.getSide() + " margin=(" + pc.portMargin.left + "," + pc.portMargin.right + "," + pc.portMargin.top + "," + pc.portMargin.bottom + ") nextToPort=" + pc.labelsNextToPort + " labelCell=" + (pc.portLabelCell != null ? "min(" + pc.portLabelCell.getMinimumWidth() + "," + pc.portLabelCell.getMinimumHeight() + ")" : "null"));
                    for (var lbl : pc.port.getLabels()) {
                        System.out.println("      label " + lbl.getText() + " size=(" + lbl.getSize().x + "," + lbl.getSize().y + ")");
                    }
                }
            }
        }
    }
}
