import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.eclipse.elk.alg.common.nodespacing.NodeLabelAndSizeCalculator;
import org.eclipse.elk.alg.common.nodespacing.internal.NodeContext;
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

/** 完整复刻 NodeLabelAndSizeCalculator.process 各阶段, 打印 E/W cell content 变化. */
public class CellProbe5 {
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
            if (size.x < 300) continue;
            NodeContext ctx = new NodeContext(adapter, na);
            PortContextCreator.createPortContexts(ctx, false);
            NodeLabelCellCreator.createNodeLabelCells(ctx, false, true);
            InsidePortLabelCellCreator.createInsidePortLabelCells(ctx);
            System.out.println("  after phase1: E content=(" + ctx.insidePortLabelCells.get(PortSide.EAST).getMinimumContentAreaSize().x + "," + ctx.insidePortLabelCells.get(PortSide.EAST).getMinimumContentAreaSize().y + ") W=(" + ctx.insidePortLabelCells.get(PortSide.WEST).getMinimumContentAreaSize().x + "," + ctx.insidePortLabelCells.get(PortSide.WEST).getMinimumContentAreaSize().y + ")");
            NodeLabelAndSizeUtilities.setupMinimumClientAreaSize(ctx);
            NodeLabelAndSizeUtilities.setupNodePaddingForPortsWithOffset(ctx);
            HorizontalPortPlacementSizeCalculator.calculateHorizontalPortPlacementSize(ctx);
            VerticalPortPlacementSizeCalculator.calculateVerticalPortPlacementSize(ctx);
            System.out.println("  after phase3: E=(" + ctx.insidePortLabelCells.get(PortSide.EAST).getMinimumContentAreaSize().x + "," + ctx.insidePortLabelCells.get(PortSide.EAST).getMinimumContentAreaSize().y + ") W=(" + ctx.insidePortLabelCells.get(PortSide.WEST).getMinimumContentAreaSize().x + "," + ctx.insidePortLabelCells.get(PortSide.WEST).getMinimumContentAreaSize().y + ")");
            CellSystemConfigurator.configureCellSystemSizeContributions(ctx);
            NodeSizeCalculator.setNodeWidth(ctx);
            PortPlacementCalculator.placeHorizontalPorts(ctx);
            PortLabelPlacementCalculator.placeHorizontalPortLabels(ctx);
            NodeSizeCalculator.setNodeHeight(ctx);
            CellSystemConfigurator.updateVerticalInsidePortLabelCellPadding(ctx);
            System.out.println("  after phase6: E=(" + ctx.insidePortLabelCells.get(PortSide.EAST).getMinimumContentAreaSize().x + "," + ctx.insidePortLabelCells.get(PortSide.EAST).getMinimumContentAreaSize().y + ") EminW=" + ctx.insidePortLabelCells.get(PortSide.EAST).getMinimumWidth() + " W=(" + ctx.insidePortLabelCells.get(PortSide.WEST).getMinimumContentAreaSize().x + "," + ctx.insidePortLabelCells.get(PortSide.WEST).getMinimumContentAreaSize().y + ") WminW=" + ctx.insidePortLabelCells.get(PortSide.WEST).getMinimumWidth() + " midW=" + ctx.nodeContainerMiddleRow.getMinimumWidth());
        }
    }
}
