import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.eclipse.elk.alg.common.nodespacing.NodeLabelAndSizeCalculator;
import org.eclipse.elk.alg.common.nodespacing.internal.NodeContext;
import org.eclipse.elk.alg.common.nodespacing.internal.PortContext;
import org.eclipse.elk.alg.common.nodespacing.internal.algorithm.*;
import org.eclipse.elk.alg.common.nodespacing.cellsystem.*;
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
import org.eclipse.elk.core.util.adapters.GraphAdapters.PortAdapter;
import org.eclipse.elk.graph.ElkNode;

/** 聚焦 MyNode1 (NORTH): 打印 N cell content 尺寸 + 端口 margin/标签. */
public class CellProbe3 {
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
        if (!parent.contains("OneBorderNode_LabelFixedPartiallyInside") && !parent.contains("SeveralBorderNodes_LabelInsideAndOutside")) return;
        GraphAdapter<LGraph> adapter = LGraphAdapters.adapt(g, true, true, node -> node.getType() == NodeType.NORMAL);
        for (NodeAdapter<?> na : adapter.getNodes()) {
            NodeContext ctx = new NodeContext(adapter, na);
            PortContextCreator.createPortContexts(ctx, false);
            NodeLabelCellCreator.createNodeLabelCells(ctx, false, true);
            InsidePortLabelCellCreator.createInsidePortLabelCells(ctx);
            NodeLabelAndSizeUtilities.setupMinimumClientAreaSize(ctx);
            NodeLabelAndSizeUtilities.setupNodePaddingForPortsWithOffset(ctx);
            HorizontalPortPlacementSizeCalculator.calculateHorizontalPortPlacementSize(ctx);
            VerticalPortPlacementSizeCalculator.calculateVerticalPortPlacementSize(ctx);
            CellSystemConfigurator.configureCellSystemSizeContributions(ctx);
            org.eclipse.elk.core.math.KVector size = na.getSize();
            System.out.println("  node size=(" + size.x + "," + size.y + ")");
            AtomicCell nc = ctx.insidePortLabelCells.get(PortSide.NORTH);
            System.out.println("    Ncell content=" + nc.getMinimumContentAreaSize() + " pad=" + nc.getPadding());
            for (PortContext pc : ctx.portContexts.get(PortSide.NORTH)) {
                System.out.println("    port side=" + pc.port.getSide() + " size=" + pc.port.getSize()
                    + " margin=(" + pc.portMargin.left + "," + pc.portMargin.right + ")"
                    + " labelsNextToPort=" + pc.labelsNextToPort
                    + " labelCell=" + (pc.portLabelCell != null));
                for (var lbl : pc.port.getLabels()) {
                    System.out.println("      label text=[" + lbl.getText() + "] size=" + lbl.getSize() + " pos=" + lbl.getPosition());
                }
            }
            System.out.println("    portPort=" + ctx.portPortSpacing + " surrounding=" + ctx.surroundingPortMargins
                + " alignment=" + ctx.getPortAlignment(PortSide.NORTH) + " labelSpacingV=" + ctx.portLabelSpacingVertical);
            GridContainerCell grid = ctx.insideNodeLabelContainer;
            for (ContainerArea row : ContainerArea.values()) {
                for (ContainerArea col : ContainerArea.values()) {
                    Cell cc = grid.getCell(row, col);
                    if (cc != null) {
                        System.out.println("    inner[" + row + "," + col + "] min=(" + cc.getMinimumWidth() + "," + cc.getMinimumHeight() + ")");
                        if (cc instanceof LabelCell) {
                            System.out.println("      labelCell pad=" + ((LabelCell) cc).getPadding() + " labels=" + ((LabelCell) cc).getLabels().size());
                        }
                    }
                }
            }
            System.out.println("    inner min=(" + grid.getMinimumWidth() + "," + grid.getMinimumHeight() + ") pad=" + grid.getPadding()
                + " labelCellSpacing=" + ctx.labelCellSpacing + " labelLabel=" + ctx.labelLabelSpacing + " nodeLabelPad=" + ctx.nodeLabelsPadding);
            try {
                java.lang.reflect.Method mh = GridContainerCell.class.getDeclaredMethod("minRowHeights", boolean.class);
                mh.setAccessible(true);
                double[] rh = (double[]) mh.invoke(grid, true);
                java.lang.reflect.Method mw = GridContainerCell.class.getDeclaredMethod("minColumnWidths", ContainerArea.class, boolean.class);
                mw.setAccessible(true);
                double[] cw = (double[]) mw.invoke(grid, ContainerArea.BEGIN, true);
                System.out.println("    rows=" + java.util.Arrays.toString(rh) + " beginCols=" + java.util.Arrays.toString(cw));
            } catch (Exception e) { e.printStackTrace(); }
        }
    }
}
