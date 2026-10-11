import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.eclipse.elk.alg.common.nodespacing.NodeLabelAndSizeCalculator;
import org.eclipse.elk.alg.common.nodespacing.internal.NodeContext;
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
import org.eclipse.elk.graph.ElkNode;

/** 逐 cell 打印 min 尺寸: 在 LabelAndNodeSizeProcessor 后重跑 cell 系统前 6 阶段. */
public class CellProbe2 {
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
        if (parent.equals("ROOT")) { parent = "ROOT"; } else {
            if (!parent.contains("OneBorderNode_LabelFixedPartiallyInside") && !parent.contains("SeveralBorderNodes_LabelFixedPartiallyInside")
                && !parent.contains("SeveralBorderNodes_LabelInsideAndOutside") && !parent.contains("OneBorderNode_LabelInside")) return;
        }
        System.out.println("=== graph parent=[" + parent + "]");
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
            double w = ctx.nodeContainer.getMinimumWidth();
            double h = ctx.nodeContainer.getMinimumHeight();
            double nw = ctx.insidePortLabelCells.get(PortSide.NORTH).getMinimumWidth();
            double nh = ctx.insidePortLabelCells.get(PortSide.NORTH).getMinimumHeight();
            double sw = ctx.insidePortLabelCells.get(PortSide.SOUTH).getMinimumWidth();
            double sh = ctx.insidePortLabelCells.get(PortSide.SOUTH).getMinimumHeight();
            double ww = ctx.insidePortLabelCells.get(PortSide.WEST).getMinimumWidth();
            double wh = ctx.insidePortLabelCells.get(PortSide.WEST).getMinimumHeight();
            double ew = ctx.insidePortLabelCells.get(PortSide.EAST).getMinimumWidth();
            double eh = ctx.insidePortLabelCells.get(PortSide.EAST).getMinimumHeight();
            double midw = ctx.nodeContainerMiddleRow.getMinimumWidth();
            double midh = ctx.nodeContainerMiddleRow.getMinimumHeight();
            double innerw = ctx.insideNodeLabelContainer != null ? ctx.insideNodeLabelContainer.getMinimumWidth() : -1;
            double innerh = ctx.insideNodeLabelContainer != null ? ctx.insideNodeLabelContainer.getMinimumHeight() : -1;
            org.eclipse.elk.core.math.KVector size = na.getSize();
            boolean nC = ctx.insidePortLabelCells.get(PortSide.NORTH).isContributingToMinimumHeight();
            boolean sC = ctx.insidePortLabelCells.get(PortSide.SOUTH).isContributingToMinimumHeight();
            boolean eC = ctx.insidePortLabelCells.get(PortSide.EAST).isContributingToMinimumHeight();
            boolean wC = ctx.insidePortLabelCells.get(PortSide.WEST).isContributingToMinimumHeight();
            boolean midC = ctx.nodeContainerMiddleRow.isContributingToMinimumHeight();
            boolean midW = ctx.nodeContainerMiddleRow.isContributingToMinimumWidth();
            boolean nWC = ctx.insidePortLabelCells.get(PortSide.NORTH).isContributingToMinimumWidth();
            System.out.println("  node size=(" + size.x + "," + size.y
                + ") contMin=(" + w + "," + h + ") N=(" + nw + "," + nh + ") S=(" + sw + "," + sh
                + ") W=(" + ww + "," + wh + ") E=(" + ew + "," + eh
                + ") mid=(" + midw + "," + midh + ") inner=(" + innerw + "," + innerh + ")"
                + " pad=" + ctx.nodeContainer.getPadding()
                + " flags NminH=" + nC + " SminH=" + sC + " EminH=" + eC + " WminH=" + wC
                + " midH=" + midC + " midW=" + midW + " NminW=" + nWC);
        }
    }
}
