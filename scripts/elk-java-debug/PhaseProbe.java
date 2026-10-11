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

/** 复刻 Phase5/6: 打印 placeHorizontalPortLabels 后 N/S cell content.y 与 setNodeHeight 前 nodeContainer minH. */
public class PhaseProbe {
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
            boolean hasSouthInsideLabel = ctx.portLabelsPlacement.contains(org.eclipse.elk.core.options.PortLabelPlacement.INSIDE)
                && !ctx.portContexts.get(PortSide.SOUTH).isEmpty();
            if (!hasSouthInsideLabel) continue;
            NodeSizeCalculator.setNodeWidth(ctx);
            PortPlacementCalculator.placeHorizontalPorts(ctx);
            PortLabelPlacementCalculator.placeHorizontalPortLabels(ctx);
            System.out.println("NODE size=" + na.getSize() + " label=" + na.getLabels().iterator().next().getText());
            AtomicCell sc = ctx.insidePortLabelCells.get(PortSide.SOUTH);
            System.out.println("  after Phase5: S cell content=" + sc.getMinimumContentAreaSize() + " pad=" + sc.getPadding());
            System.out.println("  nodeContainer minH before setNodeHeight=" + ctx.nodeContainer.getMinimumHeight() + " pad=" + ctx.nodeContainer.getPadding());
            System.out.println("  middleRow minH=" + ctx.nodeContainerMiddleRow.getMinimumHeight());
            for (PortContext pc : ctx.portContexts.get(PortSide.SOUTH)) {
                if (pc.portLabelCell != null) {
                    System.out.println("  SOUTH labelCell rect=" + pc.portLabelCell.getCellRectangle() + " min=" + pc.portLabelCell.getMinimumWidth() + "x" + pc.portLabelCell.getMinimumHeight());
                }
            }
        }
    }
}
