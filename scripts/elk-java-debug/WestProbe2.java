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
import org.eclipse.elk.graph.ElkNode;

/** 完整复刻 process() 的 cell 布局 + 端口放置, 打印 W cell rect / 端口最终位置. */
public class WestProbe2 {
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
            if (ctx.portContexts.get(PortSide.WEST).isEmpty() && ctx.portContexts.get(PortSide.EAST).isEmpty()
                    && ctx.portContexts.get(PortSide.NORTH).isEmpty()) continue;
            // 模拟 setNodeWidth + layoutChildrenHorizontally
            ctx.nodeContainer.getCellRectangle().width = na.getSize().x;
            ctx.nodeContainer.layoutChildrenHorizontally();
            PortPlacementCalculator.placeHorizontalPorts(ctx);
            // Phase 6: update padding + setNodeHeight + layoutChildrenVertically
            CellSystemConfigurator.updateVerticalInsidePortLabelCellPadding(ctx);
            ctx.nodeContainer.getCellRectangle().height = na.getSize().y;
            ctx.nodeContainer.layoutChildrenVertically();
            NodeLabelAndSizeUtilities.offsetSouthernPortsByNodeSize(ctx);
            PortPlacementCalculator.placeVerticalPorts(ctx);
            AtomicCell wc = ctx.insidePortLabelCells.get(PortSide.WEST);
            System.out.println("W cell rect=" + wc.getCellRectangle() + " content=" + wc.getMinimumContentAreaSize() + " pad=" + wc.getPadding());
            System.out.println("  nodeContainer pad=" + ctx.nodeContainer.getPadding() + " middleRow rect=" + ctx.nodeContainerMiddleRow.getCellRectangle());
            for (PortContext pc : ctx.portContexts.get(PortSide.WEST)) {
                System.out.println("  port y=" + pc.portPosition.y + " x=" + pc.portPosition.x + " size=" + pc.port.getSize());
            }
        }
    }
}
